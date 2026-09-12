import { context, checked, required } from '@/lib/security/context';
import { credentialStatus } from '@/lib/ai/credentials';
import { SettingsView } from '@/features/settings/view';
import type { AIConfig } from '@/lib/domain';
import { effectiveConfigs } from '@/lib/ai/defaults';
export default async function Page() {
  const ctx = await context();
  const [configs, profile, company] = await Promise.all([
    ctx.db
      .from('ai_provider_configs')
      .select('purpose,provider,model')
      .eq('workspace_id', ctx.workspaceId),
    ctx.db.from('profiles').select('name,onboarding_draft').eq('id', ctx.user.id).maybeSingle(),
    ctx.db.from('workspaces').select('name,timezone').eq('id', ctx.workspaceId).single(),
  ]);
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
    />
  );
}
