import { context, checked, required } from '@/lib/security/context';
import { requireAgent } from '@/lib/security/agent';
import { AgentFilter } from '@/components/agent-filter';
import { Dashboard } from '@/features/dashboard/view';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await context(),
    params = await searchParams,
    agentId = await requireAgent(ctx, params.agent);
  const agentList =
    checked(
      await ctx.db
        .from('agents')
        .select('id,name,active,channels')
        .eq('workspace_id', ctx.workspaceId),
    ) || [];
  const scope = () => {
    let q = ctx.db
      .from('content_items')
      .select('id,topic,status,created_at,scheduled_at,content_variants(channel)')
      .eq('workspace_id', ctx.workspaceId);
    if (agentId) q = q.eq('agent_id', agentId);
    return q;
  };
  const counts = await Promise.all(
    ['', 'PUBLISHED', 'SCHEDULED', 'AWAITING_REVIEW'].map((status) => {
      let q = ctx.db
        .from('content_items')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', ctx.workspaceId);
      if (agentId) q = q.eq('agent_id', agentId);
      if (status) q = q.eq('status', status);
      return q;
    }),
  );
  counts.forEach(checked);
  let runQuery = ctx.db
    .from('agent_runs')
    .select('id,stage,status,error_code')
    .eq('workspace_id', ctx.workspaceId);
  if (agentId) runQuery = runQuery.eq('agent_id', agentId);
  const [recent, upcoming, workspace, runs] = await Promise.all([
    scope().order('created_at', { ascending: false }).limit(5),
    scope()
      .eq('status', 'SCHEDULED')
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at')
      .limit(5),
    ctx.db.from('workspaces').select('name').eq('id', ctx.workspaceId).single(),
    runQuery.order('started_at', { ascending: false }).limit(3),
  ]);
  return (
    <>
      <div className="toolbar">
        <AgentFilter agents={agentList} />
      </div>
      <Dashboard
        name={agentId ? agentList.find((a) => a.id === agentId)!.name : required(workspace).name}
        counts={counts.map((c) => c.count || 0)}
        recent={checked(recent) || []}
        upcoming={checked(upcoming) || []}
        agentId={agentId || ''}
        agents={agentList.filter((a) => a.active && (!agentId || a.id === agentId)).length}
        runs={checked(runs) || []}
      />
    </>
  );
}
