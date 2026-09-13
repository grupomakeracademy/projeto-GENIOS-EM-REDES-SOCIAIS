import { context, checked } from '@/lib/security/context';
import { AgentEditor } from '@/features/agents/editor';
import type { Agent, Asset } from '@/lib/domain';
import { requireAgent } from '@/lib/security/agent';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const ctx = await context();
  await requireAgent(ctx, (await searchParams).agent);
  const [agents, assets, memories, schedules] = await Promise.all([
    ctx.db.from('agents').select('*').eq('workspace_id', ctx.workspaceId).limit(100),
    ctx.db.from('assets').select('*').eq('workspace_id', ctx.workspaceId).limit(100),
    ctx.db
      .from('editorial_memory')
      .select('id,agent_id,topic,angle,created_at')
      .eq('workspace_id', ctx.workspaceId)
      .order('created_at', { ascending: false })
      .limit(100),
    ctx.db.from('agent_schedules').select('*').eq('workspace_id', ctx.workspaceId),
  ]);
  const assetList = checked(assets) as Asset[];
  for (const asset of assetList) {
    if (asset.mime_type.startsWith('image/') && asset.storage_path) {
      const signed = await ctx.db.storage
        .from('brand-assets')
        .createSignedUrl(asset.storage_path, 900);
      (asset as Asset & { url?: string }).url = signed.data?.signedUrl || undefined;
    }
  }
  return (
    <AgentEditor
      agents={checked(agents) as Agent[]}
      assets={assetList}
      memories={checked(memories) || []}
      schedules={checked(schedules) || []}
      canEdit={ctx.role !== 'VIEWER'}
    />
  );
}
