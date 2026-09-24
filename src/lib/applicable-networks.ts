import { adminClient } from './supabase/server';
import 'server-only';
import { checked, type context } from './security/context';
import { applicableNetworks } from './network-filter';

export async function workspaceNetworks(ctx: Awaited<ReturnType<typeof context>>) {
  const [connections, agents] = await Promise.all([
    adminClient().from('social_connections').select('channel').eq('workspace_id', ctx.workspaceId),
    ctx.db.from('agents').select('channels').eq('workspace_id', ctx.workspaceId),
  ]);
  return applicableNetworks([
    ...(checked(connections) || []).map(c => c.channel),
    ...(checked(agents) || []).flatMap(a => a.channels || []),
  ]);
}
