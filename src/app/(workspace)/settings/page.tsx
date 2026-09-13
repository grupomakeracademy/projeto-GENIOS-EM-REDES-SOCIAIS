import { context, checked, required } from '@/lib/security/context';
import { credentialStatus } from '@/lib/ai/credentials';
import { SettingsView, type SettingsQuotaUser } from '@/features/settings/view';
import type { AIConfig } from '@/lib/domain';
import { effectiveConfigs } from '@/lib/ai/defaults';
import { isSuperAdmin } from '@/lib/security/super-admin';
import { adminClient } from '@/lib/supabase/server';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const ctx = await context();
  const isSuper = isSuperAdmin(ctx.user);
  const params = await searchParams;

  const [configs, profile, company] = await Promise.all([
    ctx.db
      .from('ai_provider_configs')
      .select('purpose,provider,model')
      .eq('workspace_id', ctx.workspaceId),
    ctx.db.from('profiles').select('name,onboarding_draft').eq('id', ctx.user.id).maybeSingle(),
    ctx.db.from('workspaces').select('name,timezone').eq('id', ctx.workspaceId).single(),
  ]);

  let quotaUsers: SettingsQuotaUser[] = [];

  if (isSuper) {
    try {
      const db = adminClient();
      const members =
        checked(
          await db
            .from('workspace_members')
            .select('user_id,role')
            .eq('workspace_id', ctx.workspaceId),
        ) ?? [];

      const memberIds = members.map((m) => m.user_id);
      const profiles = memberIds.length
        ? checked(
            await db
              .from('profiles')
              .select('id,name,storage_quota_mb')
              .in('id', memberIds),
          ) ?? []
        : [];

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

      const profileMap = new Map((profiles as Array<{ id: string; name: string; storage_quota_mb: number | null }>).map((p) => [p.id, p]));

      quotaUsers = (members || []).map((m: any) => {
        const p = profileMap.get(m.user_id);
        const q = p?.storage_quota_mb ?? 100;
        return {
          id: m.user_id,
          name: p?.name || 'Usuário',
          email: '',
          usedBytes: usageByUser[m.user_id] || 0,
          quotaMB: q,
          isUnlimited: q === -1 || q === null,
          role: m.role,
        };
      });
    } catch (e) {
      console.error('Failed to load quota users in settings:', e);
    }
  }

  const credentials = ctx.role === 'ADMIN' ? credentialStatus() : null;
  const profileData = checked(profile);
  const avatarUrl =
    (profileData?.onboarding_draft as Record<string, string>)?.avatar_url ||
    (ctx.user.user_metadata?.avatar_url as string) ||
    '';
  return (
    <SettingsView
      configs={effectiveConfigs(checked(configs) as AIConfig[])}
      credentials={credentials}
      profile={{ name: profileData?.name || '', email: ctx.user.email || '', avatarUrl }}
      company={required(company)}
      canAdmin={ctx.role === 'ADMIN'}
      isSuperAdmin={isSuper}
      initialTab={params.tab || 'ai'}
      initialQuotaUsers={quotaUsers}
    />
  );
}
