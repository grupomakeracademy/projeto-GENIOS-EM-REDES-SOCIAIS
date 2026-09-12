import { context, checked, required } from '@/lib/security/context';
import { Dashboard } from '@/features/dashboard/view';
export default async function Page() {
  const ctx = await context();
  const counts = await Promise.all(
    ['', 'PUBLISHED', 'SCHEDULED', 'AWAITING_REVIEW'].map((status) => {
      let q = ctx.db
        .from('content_items')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', ctx.workspaceId);
      if (status) q = q.eq('status', status);
      return q;
    }),
  );
  for (const c of counts) checked(c);
  const [recent, agents, workspace, runs] = await Promise.all([
    ctx.db
      .from('content_items')
      .select('id,topic,status,created_at')
      .eq('workspace_id', ctx.workspaceId)
      .order('created_at', { ascending: false })
      .limit(5),
    ctx.db
      .from('agents')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', ctx.workspaceId)
      .eq('active', true),
    ctx.db.from('workspaces').select('name').eq('id', ctx.workspaceId).single(),
    ctx.db
      .from('agent_runs')
      .select('id,stage,status,error_code')
      .eq('workspace_id', ctx.workspaceId)
      .order('started_at', { ascending: false })
      .limit(3),
  ]);
  checked(agents);
  return (
    <Dashboard
      name={required(workspace).name}
      counts={counts.map((c) => c.count || 0)}
      recent={checked(recent) || []}
      agents={agents.count || 0}
      runs={checked(runs) || []}
    />
  );
}
