import { Support } from '@/features/support/center';
import { context, required } from '@/lib/security/context';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ticket?: string }>;
}) {
  const ctx = await context();
  const company = required(
    await ctx.db.from('workspaces').select('name,timezone').eq('id', ctx.workspaceId).single(),
  );
  const memberships = required(
    await ctx.db
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', ctx.user.id)
      .eq('role', 'ADMIN'),
  );
  const workspaces = memberships.length
    ? required(
        await ctx.db
          .from('workspaces')
          .select('id,name')
          .in(
            'id',
            memberships.map((m) => m.workspace_id),
          ),
      )
    : [];
  return (
    <Support
      key={ctx.workspaceId}
      workspaceId={ctx.workspaceId}
      workspaces={workspaces}
      initialTicket={(await searchParams).ticket || ''}
      canAdmin={ctx.role === 'ADMIN'}
      userId={ctx.user.id}
      timezone={company.timezone}
      workspaceName={company.name}
    />
  );
}
