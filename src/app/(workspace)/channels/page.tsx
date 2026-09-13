import { context, checked } from '@/lib/security/context';
import { requireAgent } from '@/lib/security/agent';
import { adminClient } from '@/lib/supabase/server';
import { ChannelsView } from '@/features/channels/view';
import { AssignConnection } from '@/features/channels/assign';
import { AgentFilter } from '@/components/agent-filter';
import { channels, type Channel } from '@/lib/domain';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const ctx = await context(),
    params = await searchParams,
    agentId = await requireAgent(ctx, params.agent);
  const agents =
    checked(await ctx.db.from('agents').select('id,name').eq('workspace_id', ctx.workspaceId)) ||
    [];
  const result = await adminClient()
    .from('social_connections')
    .select('id,agent_id,channel,account_name,created_at')
    .eq('workspace_id', ctx.workspaceId);
  if (result.error?.code === '42703')
    return (
      <>
        <h1>Canais</h1>
        <p>A atualização das conexões por agente aguarda a migração do banco.</p>
      </>
    );
  const rows = checked(result) || [];
  return (
    <>
      <h1>Canais</h1>
      <div className="toolbar">
        <AgentFilter agents={agents} />
      </div>
      {agents
        .filter((a) => !agentId || a.id === agentId)
        .map((a) => {
          const initial = Object.fromEntries(
            Object.keys(channels).map((channel) => {
              const row = rows.find((r) => r.agent_id === a.id && r.channel === channel);
              return [
                channel,
                { connected: !!row, accountName: row?.account_name, connectedAt: row?.created_at },
              ];
            }),
          ) as Record<Channel, { connected: boolean; accountName?: string; connectedAt?: string }>;
          return (
            <ChannelsView
              key={a.id}
              agentId={a.id}
              agentName={a.name}
              initialConnections={initial}
              canEdit={ctx.role !== 'VIEWER'}
            />
          );
        })}
      {!agentId &&
        rows
          .filter((r) => !r.agent_id)
          .map((r) => (
            <AssignConnection
              key={r.id}
              connection={r}
              agents={agents}
              canEdit={ctx.role !== 'VIEWER'}
            />
          ))}
    </>
  );
}
