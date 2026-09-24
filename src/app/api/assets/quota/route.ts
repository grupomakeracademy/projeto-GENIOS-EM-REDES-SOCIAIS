import { accountStorage } from '@/lib/account-storage';
import { z } from 'zod';
import { guard, fail, AppError, checked } from '@/lib/security/context';
import { adminClient } from '@/lib/supabase/server';
import { isSuperAdmin, requireSuperAdmin } from '@/lib/security/super-admin';

export async function GET(request: Request) {
  try {
    const ctx = await guard(request, 'read');
    const isSuper = isSuperAdmin(ctx.user);

    const {usedBytes,quotaMB,isUnlimited,availableBytes,reservedBytes} = await accountStorage(ctx.user);

    let users: Array<{
      id: string;
      name: string;
      email: string;
      usedBytes: number;
      quotaMB: number;
      isUnlimited: boolean;
      role: string;
    }> = [];

    if (isSuper && new URL(request.url).searchParams.get('summary') !== '1') {
      try {
        const db = adminClient();
        const [authRes, profilesRes, membersRes, assetsRes] = await Promise.all([
          db.auth.admin.listUsers({ perPage: 1000 }),
          db.from('profiles').select('id,name,storage_quota_mb'),
          db.from('workspace_members').select('user_id,role'),
          db.from('account_storage_usage').select('created_by,size'),
        ]);

        const authUsers = authRes.data?.users || [];
        const profiles = checked(profilesRes) ?? [];
        const members = checked(membersRes) ?? [];
        const allAssets = checked(assetsRes) ?? [];

        const usageByUser: Record<string, number> = {};
        for (const a of allAssets || []) {
          if (a.created_by) {
            usageByUser[a.created_by] = (usageByUser[a.created_by] || 0) + (a.size || 0);
          }
        }

        const roleMap = new Map((members || []).map((m: any) => [m.user_id, m.role]));
        const profileMap = new Map((profiles as Array<{ id: string; name: string; storage_quota_mb: number | null }>).map((p) => [p.id, p]));

        const userMap = new Map<string, any>();
        for (const u of authUsers) {
          const p = profileMap.get(u.id);
          const q = p?.storage_quota_mb === null ? -1 : (p?.storage_quota_mb ?? 2048);
          const displayName = p?.name || (u.user_metadata as Record<string, string>)?.full_name || u.email?.split('@')[0] || 'Usuário';
          const role = roleMap.get(u.id) || (u.email?.toLowerCase() === 'r.barros84@gmail.com' ? 'ADMIN' : 'MEMBER');
          userMap.set(u.id, {
            id: u.id,
            name: displayName,
            email: u.email || '',
            usedBytes: usageByUser[u.id] || 0,
            quotaMB: q,
            isUnlimited: q === -1 || q === null,
            role,
          });
        }
        for (const p of profiles) {
          if (!userMap.has(p.id)) {
            const q = p?.storage_quota_mb === null ? -1 : (p?.storage_quota_mb ?? 2048);
            userMap.set(p.id, {
              id: p.id,
              name: p.name || 'Usuário',
              email: '',
              usedBytes: usageByUser[p.id] || 0,
              quotaMB: q,
              isUnlimited: q === -1 || q === null,
              role: roleMap.get(p.id) || 'MEMBER',
            });
          }
        }

        users = Array.from(userMap.values()).sort((a, b) => {
          if (a.email.toLowerCase() === 'r.barros84@gmail.com') return -1;
          if (b.email.toLowerCase() === 'r.barros84@gmail.com') return 1;
          return a.name.localeCompare(b.name);
        });
      } catch (e) {
        console.error('Failed to load quota users in API:', e);
      }
    }

    return Response.json({
      usedBytes,
      quotaMB,
      availableBytes,
      reservedBytes,
      isUnlimited,
      users: isSuper ? users : [],
      isSuperAdmin: isSuper,
    });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await guard(request, 'read');
    requireSuperAdmin(ctx.user);
    const { userId, quotaMB } = z
      .object({
        userId: z.string().uuid(),
        quotaMB: z.number().int().min(-1).max(1000000),
      })
      .parse(await request.json());

    const db = adminClient();
    const profile = checked(
      await db
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle(),
    );
    if (!profile) throw new AppError('user_not_found', 404);

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
