import { context } from '@/lib/security/context';
import { NewAgentWizard } from '@/features/agents/new-wizard';
export default async function Page() {
  const ctx = await context('write');
  return <NewAgentWizard draftKey={`genios-new-agent:${ctx.workspaceId}:${ctx.user.id}`} />;
}
