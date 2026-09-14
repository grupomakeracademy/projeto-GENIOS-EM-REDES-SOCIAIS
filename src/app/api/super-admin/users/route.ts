import { z } from 'zod';
import { guard, fail, AppError } from '@/lib/security/context';
import { adminClient } from '@/lib/supabase/server';
import { requireSuperAdmin, SUPER_ADMIN_EMAIL } from '@/lib/security/super-admin';
import { getAdminUsersList } from '@/lib/super-admin/users-service';

export async function GET(request: Request) {
  try {
    const ctx = await guard(request, 'read');
    requireSuperAdmin(ctx.user);

    const userDetails = await getAdminUsersList();
    return Response.json({ users: userDetails });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await guard(request, 'read');
    requireSuperAdmin(ctx.user);
    const db = adminClient();

    const body = await request.json();
    const actionSchema = z.object({
      action: z.enum(['status', 'quota', 'reset_password', 'assign_content_quota']),
    });
    const { action } = actionSchema.parse(body);

    if (action === 'status') {
      const { userId, status } = z
        .object({
          userId: z.string().uuid(),
          status: z.enum(['active', 'inactive', 'blocked']),
        })
        .parse(body);

      const { data: targetUserData, error: getErr } = await db.auth.admin.getUserById(userId);
      if (getErr || !targetUserData?.user) throw new AppError('user_not_found', 404);
      const targetUser = targetUserData.user;

      // Prevent super admin self-deactivation or blocking
      if (
        targetUser.id === ctx.user.id ||
        targetUser.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()
      ) {
        if (status !== 'active') {
          throw new AppError('forbidden', 403);
        }
      }

      const existingMeta = targetUser.user_metadata || {};
      const banDuration = status === 'blocked' ? '876000h' : 'none';

      const { error: updateErr } = await db.auth.admin.updateUserById(userId, {
        user_metadata: { ...existingMeta, status },
        ban_duration: banDuration,
      });
      if (updateErr) throw new AppError('database_error', 500);

      // Audit log
      const { data: member } = await db
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();
      const workspaceId = member?.workspace_id || ctx.workspaceId;

      await db.from('audit_logs').insert({
        workspace_id: workspaceId,
        actor: ctx.user.id,
        event: 'USER_STATUS_UPDATED',
        metadata: {
          target_user_id: userId,
          target_user_email: targetUser.email,
          previous_status: existingMeta.status || 'active',
          new_status: status,
          admin_email: ctx.user.email,
        },
      });

      return Response.json({ ok: true, status });
    }

    if (action === 'quota') {
      const { userId, quotaMB, reason } = z
        .object({
          userId: z.string().uuid(),
          quotaMB: z.number().int().min(-1).max(1000000),
          reason: z.string().max(500).optional(),
        })
        .parse(body);

      const { data: profile } = await db
        .from('profiles')
        .select('id,storage_quota_mb')
        .eq('id', userId)
        .maybeSingle();
      const prevQuota = profile?.storage_quota_mb ?? 100;

      const { error: updateErr } = await db
        .from('profiles')
        .upsert({
          id: userId,
          storage_quota_mb: quotaMB,
        });
      if (updateErr) throw new AppError('database_error', 500);

      const { data: targetUserData } = await db.auth.admin.getUserById(userId);
      const targetEmail = targetUserData?.user?.email || '';

      const { data: member } = await db
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();
      const workspaceId = member?.workspace_id || ctx.workspaceId;

      const { data: auditEntry } = await db
        .from('audit_logs')
        .insert({
          workspace_id: workspaceId,
          actor: ctx.user.id,
          event: 'USER_QUOTA_ADJUSTED',
          metadata: {
            target_user_id: userId,
            target_user_email: targetEmail,
            previous_quota_mb: prevQuota,
            new_quota_mb: quotaMB,
            reason: reason?.trim() || null,
            admin_email: ctx.user.email,
          },
        })
        .select()
        .single();

      return Response.json({
        ok: true,
        quotaMB,
        auditLog: auditEntry
          ? {
              id: auditEntry.id,
              created_at: auditEntry.created_at,
              actor: auditEntry.actor,
              admin_email: ctx.user.email,
              previous_quota_mb: prevQuota,
              new_quota_mb: quotaMB,
              reason: reason?.trim() || null,
            }
          : null,
      });
    }

    if (action === 'reset_password') {
      const { userId } = z.object({ userId: z.string().uuid() }).parse(body);
      const { data: targetUserData, error: getErr } = await db.auth.admin.getUserById(userId);
      if (getErr || !targetUserData?.user?.email) throw new AppError('user_not_found', 404);

      const targetEmail = targetUserData.user.email;
      const origin = new URL(request.url).origin;

      const { error: resetErr } = await db.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: `${origin}/auth/callback?next=/login?mode=reset`,
      });
      if (resetErr) throw new AppError('database_error', 500);

      const { data: member } = await db
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();
      const workspaceId = member?.workspace_id || ctx.workspaceId;

      await db.from('audit_logs').insert({
        workspace_id: workspaceId,
        actor: ctx.user.id,
        event: 'USER_PASSWORD_RESET_REQUESTED',
        metadata: {
          target_user_id: userId,
          target_user_email: targetEmail,
          admin_email: ctx.user.email,
        },
      });

      return Response.json({ ok: true, email: targetEmail });
    }

    if (action === 'assign_content_quota') {
      const { userId, amount, mode, reason } = z
        .object({
          userId: z.string().uuid(),
          amount: z.number().int().min(0).max(1000000),
          mode: z.enum(['add', 'set', 'ADD', 'SET']).transform((m) => m.toLowerCase() as 'add' | 'set'),
          reason: z.string().max(500).optional(),
        })
        .parse(body);

      // Find user's workspace
      const { data: member } = await db
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();
      const workspaceId = member?.workspace_id || ctx.workspaceId;

      const res = await db.rpc('assign_user_quota', {
        p_user_id: userId,
        p_amount: amount,
        p_mode: mode,
        p_reason: reason?.trim() || 'Ajuste administrativo',
        p_admin_email: ctx.user.email || null,
        p_admin_id: ctx.user.id,
        p_workspace_id: workspaceId,
      });

      if (res.error) {
        throw new AppError(res.error.message || 'database_error', 400);
      }

      await db.from('audit_logs').insert({
        workspace_id: workspaceId,
        actor: ctx.user.id,
        event: 'USER_CONTENT_QUOTA_ASSIGNED',
        metadata: {
          target_user_id: userId,
          amount,
          mode,
          reason: reason?.trim() || null,
          admin_email: ctx.user.email,
          result: res.data,
        },
      });

      // Fetch updated profile quota balance
      const { data: updatedProfile } = await db
        .from('profiles')
        .select('content_quota_balance, content_quota_total_assigned, content_quota_total_consumed')
        .eq('id', userId)
        .single();

      // Fetch latest transaction for this user
      const { data: latestTx } = await db
        .from('quota_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return Response.json({
        ok: true,
        data: res.data,
        profile: updatedProfile,
        transaction: latestTx ? { ...latestTx, admin_email: ctx.user.email } : null,
      });
    }

    throw new AppError('invalid_input', 400);
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await guard(request, 'read');
    requireSuperAdmin(ctx.user);
    const db = adminClient();

    const body = await request.json().catch(() => ({}));
    const userId = body.userId || new URL(request.url).searchParams.get('userId');
    if (!userId) throw new AppError('invalid_input', 400);

    const { data: targetUserData, error: getErr } = await db.auth.admin.getUserById(userId);
    if (getErr || !targetUserData?.user) throw new AppError('user_not_found', 404);
    const targetUser = targetUserData.user;

    // Never delete Super Admin
    if (
      targetUser.id === ctx.user.id ||
      targetUser.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()
    ) {
      throw new AppError('forbidden', 403);
    }

    const { data: member } = await db
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    const workspaceId = member?.workspace_id || ctx.workspaceId;

    // Delete user from Supabase Auth
    const { error: delErr } = await db.auth.admin.deleteUser(userId);
    if (delErr) throw new AppError('database_error', 500);

    // Also remove from profiles and workspace_members if present
    await Promise.allSettled([
      db.from('profiles').delete().eq('id', userId),
      db.from('workspace_members').delete().eq('user_id', userId),
    ]);

    await db.from('audit_logs').insert({
      workspace_id: workspaceId,
      actor: ctx.user.id,
      event: 'USER_DELETED',
      metadata: {
        target_user_id: userId,
        target_user_email: targetUser.email,
        admin_email: ctx.user.email,
      },
    });

    return Response.json({ ok: true, userId });
  } catch (e) {
    return fail(e);
  }
}
