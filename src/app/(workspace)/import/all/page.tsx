import { context, checked } from '@/lib/security/context';
import { AllImports } from '@/features/imports/all';
export default async function Page() {
  const ctx = await context();
  const agents = checked(
    await ctx.db.from('agents').select('id,name').eq('workspace_id', ctx.workspaceId).order('name'),
  );
  return <AllImports agents={agents || []} canEdit={ctx.role !== 'VIEWER'} />;
}
