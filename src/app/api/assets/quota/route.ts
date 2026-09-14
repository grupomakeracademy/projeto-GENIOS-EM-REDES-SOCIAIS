import { z } from 'zod';
import { guard, fail, AppError, checked } from '@/lib/security/context';
import { adminClient } from '@/lib/supabase/server';
import { isSuperAdmin, requireSuperAdmin } from '@/lib/security/super-admin';

export async function GET(request: Request) {
  try {
    const ctx = await guard(request, 'read');
    const isSuper = isSuperAdmin(ctx.user);

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

    const quotaMB = isSuper ? -1 : (profile?.storage_quota_mb ?? 100);
    const isUnlimited = isSuper || quotaMB === -1 || quotaMB === null;

    let users: Array<{
      id: string;
      name: string;
      email: string;
      usedBytes: number;
      quotaMB: number;
      isUnlimited: boolean;
      role: string;
    }> = [];

    if (isSuper) {
      try {
        const db = adminClient();
        const [authRes, profilesRes, membersRes, assetsRes] = await Promise.all([
          db.auth.admin.listUsers({ perPage: 1000 }),
          db.from('profiles').select('id,name,storage_quota_mb'),
          db.from('workspace_members').select('user_id,role'),
          db.from('assets').select('created_by,size'),
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
          const q = p?.storage_quota_mb ?? 100;
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
            const q = p?.storage_quota_mb ?? 100;
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
