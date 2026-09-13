import { z } from 'zod';
import { guard, fail, AppError, checked } from '@/lib/security/context';
import { adminClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const ctx = await guard(request, 'read');

    // Current user's assets
    const { data: userAssets } = await ctx.db
      .from('assets')
      .select('size')
      .eq('created_by', ctx.user.id);
    const usedBytes = (userAssets || []).reduce((acc, a) => acc + (a.size || 0), 0);

    const { data: profile } = await ctx.db
      .from('profiles')
      .select('storage_quota_mb')
      .eq('id', ctx.user.id)
      .maybeSingle();

    const quotaMB = profile?.storage_quota_mb ?? 100;
    const isUnlimited = quotaMB === -1 || quotaMB === null;

    let users: Array<{
      id: string;
      name: string;
      email: string;
      usedBytes: number;
      quotaMB: number;
      isUnlimited: boolean;
      role: string;
    }> = [];

    if (ctx.role === 'ADMIN') {
      const db = adminClient();
      const members = checked(
        await db
          .from('workspace_members')
          .select('user_id,role,profiles(id,name,storage_quota_mb)')
          .eq('workspace_id', ctx.workspaceId),
      );

      // Get storage usage for all users in workspace
      const allAssets = checked(
        await db
          .from('assets')
          .select('created_by,size')
          .eq('workspace_id', ctx.workspaceId),
      );

      const usageByUser: Record<string, number> = {};
      for (const a of allAssets || []) {
        if (a.created_by) {
          usageByUser[a.created_by] = (usageByUser[a.created_by] || 0) + (a.size || 0);
        }
      }

      users = (members || []).map((m: any) => {
        const p = m.profiles || {};
        const q = p.storage_quota_mb ?? 100;
        return {
          id: m.user_id,
          name: p.name || 'Usuário',
          email: '',
          usedBytes: usageByUser[m.user_id] || 0,
          quotaMB: q,
          isUnlimited: q === -1 || q === null,
          role: m.role,
        };
      });
    }

    return Response.json({
      usedBytes,
      quotaMB,
      isUnlimited,
      isAdmin: ctx.role === 'ADMIN',
      users,
    });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await guard(request, 'admin');
    const { userId, quotaMB } = z
      .object({
        userId: z.string().uuid(),
        quotaMB: z.number().int().min(-1).max(1000000),
      })
      .parse(await request.json());

    // Verify user belongs to this workspace
    const membership = checked(
      await ctx.db
        .from('workspace_members')
        .select('user_id')
        .eq('workspace_id', ctx.workspaceId)
        .eq('user_id', userId)
        .maybeSingle(),
    );
    if (!membership) throw new AppError('user_not_found', 404);

    const db = adminClient();
    const { error } = await db
      .from('profiles')
      .update({ storage_quota_mb: quotaMB })
      .eq('id', userId);

    if (error) throw new AppError('database_error', 500);

    return Response.json({ ok: true, userId, quotaMB });
  } catch (e) {
    return fail(e);
  }
}
