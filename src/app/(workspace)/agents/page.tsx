import { context, checked } from '@/lib/security/context';
import { AgentEditor } from '@/features/agents/editor';
import type { Agent, Asset } from '@/lib/domain';
import { requireAgent } from '@/lib/security/agent';
import { isSuperAdmin } from '@/lib/security/super-admin';
import { adminClient } from '@/lib/supabase/server';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const ctx = await context();
  const isSuper = isSuperAdmin(ctx.user);
  await requireAgent(ctx, (await searchParams).agent);

  const [agentsResult, assetsResult, memories, schedules] = await Promise.all([
    isSuper
      ? adminClient().from('agents').select('*').order('name').limit(100)
      : ctx.db.from('agents').select('*').eq('workspace_id', ctx.workspaceId).limit(100),
    ctx.db.from('assets').select('*').eq('workspace_id', ctx.workspaceId).limit(100),
    ctx.db
      .from('editorial_memory')
      .select('id,agent_id,topic,angle,created_at')
      .eq('workspace_id', ctx.workspaceId)
      .order('created_at', { ascending: false })
      .limit(100),
    ctx.db.from('agent_schedules').select('*').eq('workspace_id', ctx.workspaceId),
  ]);

  const agentList = (checked(agentsResult) || []) as Agent[];
  const assetList = (checked(assetsResult) || []) as Asset[];

  // Collect all asset IDs referenced across any agents' visual settings
  const referencedIds = new Set<string>();
  for (const ag of agentList) {
    const rIds = ag.visual_settings?.reference_ids;
    if (Array.isArray(rIds)) {
      for (const id of rIds) {
        if (typeof id === 'string') referencedIds.add(id);
      }
    }
  }

  // Fetch any referenced assets that might be from another workspace or beyond limit
  const missingIds = [...referencedIds].filter((id) => !assetList.some((a) => a.id === id));
  if (missingIds.length) {
    const { data: missingAssets } = await adminClient()
      .from('assets')
      .select('*')
      .in('id', missingIds);
    if (missingAssets) {
      for (const ma of missingAssets as Asset[]) {
        if (!assetList.some((a) => a.id === ma.id)) assetList.push(ma);
      }
    }
  }

  // If Super Admin has 0 assets in current workspace, load platform image assets for library reference picker
  if (isSuper && assetList.length === 0) {
    const { data: globalAssets } = await adminClient()
      .from('assets')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (globalAssets) {
      for (const ga of globalAssets as Asset[]) {
        if (!assetList.some((a) => a.id === ga.id)) assetList.push(ga);
      }
    }
  }

  // Batch sign URLs for image assets to avoid slow serial signing
  const imageAssets = assetList.filter((a) => a.mime_type?.startsWith('image/') && a.storage_path);
  if (imageAssets.length) {
    const paths = imageAssets.map((a) => a.storage_path);
    const { data: signedResults } = await ctx.db.storage
      .from('brand-assets')
      .createSignedUrls(paths, 900);
    if (signedResults) {
      for (let i = 0; i < imageAssets.length; i++) {
        const item = imageAssets[i];
        const signed = signedResults[i];
        if (signed?.signedUrl) {
          (item as Asset & { url?: string }).url = signed.signedUrl;
        }
      }
    }
  }

  return (
    <AgentEditor
      agents={agentList}
      assets={assetList}
      memories={checked(memories) || []}
      schedules={checked(schedules) || []}
      canEdit={ctx.role !== 'VIEWER' || isSuper}
    />
  );
}
