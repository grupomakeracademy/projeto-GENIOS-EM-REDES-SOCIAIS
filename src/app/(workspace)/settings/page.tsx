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

  const [configs, profile, company, wsSettings] = await Promise.all([
    ctx.db
      .from('ai_provider_configs')
      .select('purpose,provider,model')
      .eq('workspace_id', ctx.workspaceId),
    ctx.db.from('profiles').select('name,onboarding_draft').eq('id', ctx.user.id).maybeSingle(),
    ctx.db.from('workspaces').select('name,timezone').eq('id', ctx.workspaceId).single(),
    ctx.db.from('workspace_settings').select('settings').eq('workspace_id', ctx.workspaceId).maybeSingle(),
  ]);
  const globalQuality = (checked(wsSettings)?.settings as Record<string, string>)?.image_quality || 'low';

  let adminUsers: any[] = [];
  let quotaUsers: SettingsQuotaUser[] = [];

  if (isSuper) {
    try {
      const { getAdminUsersList } = await import('@/lib/super-admin/users-service');
      adminUsers = await getAdminUsersList();
      quotaUsers = adminUsers.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        usedBytes: u.storage_used_bytes,
        quotaMB: u.storage_quota_mb,
        isUnlimited: u.is_unlimited,
        role: u.role,
      }));
    } catch (e) {
      console.error('Failed to load admin users in settings:', e);
    }
  }

  const credentials = isSuper ? credentialStatus() : null;
  const profileData = checked(profile);
  const avatarUrl =
    (profileData?.onboarding_draft as Record<string, string>)?.avatar_url ||
    (ctx.user.user_metadata?.avatar_url as string) ||
    '';
  const requestedTab = params.tab;
  const initialTab =
    !isSuper && (!requestedTab || ['ai', 'credentials', 'library', 'users'].includes(requestedTab))
      ? 'profile'
      : (requestedTab || 'ai');

  return (
    <SettingsView
      configs={isSuper ? effectiveConfigs(checked(configs) as AIConfig[]) : []}
      credentials={credentials}
      profile={{ name: profileData?.name || '', email: ctx.user.email || '', avatarUrl }}
      company={required(company)}
      canAdmin={ctx.role === 'ADMIN'}
      isSuperAdmin={isSuper}
      initialTab={initialTab}
      initialQuotaUsers={quotaUsers}
      initialAdminUsers={adminUsers}
      globalImageQuality={globalQuality}
    />
  );
}
