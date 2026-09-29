import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Live image tests must have a review destination before they may call an image model. */
export function liveReviewDestination() {
  const workspaceId = process.env.LIVE_TEST_REVIEW_WORKSPACE_ID || '';
  const agentId = process.env.LIVE_TEST_REVIEW_AGENT_ID || '';
  const userId = process.env.LIVE_TEST_REVIEW_USER_ID || '';
  if (![workspaceId, agentId, userId].every(id => uuid.test(id))) {
    throw new Error('Configure LIVE_TEST_REVIEW_WORKSPACE_ID, LIVE_TEST_REVIEW_AGENT_ID e LIVE_TEST_REVIEW_USER_ID antes de executar testes reais de imagem.');
  }
  return { workspaceId, agentId, userId };
}

/** Copy generated results to the account's Review queue; keep the source fixture if any copy fails. */
export async function preserveLiveImagesForReview(db: SupabaseClient, sourceWorkspaceId: string) {
  const target = liveReviewDestination();
  const [agent, member] = await Promise.all([
    db.from('agents').select('id').eq('id', target.agentId).eq('workspace_id', target.workspaceId).maybeSingle(),
    db.from('workspace_members').select('role').eq('workspace_id', target.workspaceId).eq('user_id', target.userId).maybeSingle(),
  ]);
  if (agent.error || !agent.data || member.error || !member.data) throw new Error('O destino de revisão não pertence à conta configurada.');
  const sourceMedia = await db.from('content_media').select('*').eq('workspace_id', sourceWorkspaceId).neq('provider', 'test');
  if (sourceMedia.error) throw sourceMedia.error;
  const existing = await db.from('content_items').select('strategy,content_variants(content_media(id))')
    .eq('workspace_id', target.workspaceId);
  if (existing.error) throw existing.error;
  const copied = new Set((existing.data || []).filter(row =>
    row.content_variants?.some((variant: { content_media?: Array<{ id: string }> }) =>
      Boolean(variant.content_media?.length)))
    .map(row => row.strategy?.qa_source_media_id).filter(Boolean));
  let count = 0;
  for (const media of sourceMedia.data || []) {
    if (copied.has(media.id)) continue;
    const file = await db.storage.from('brand-assets').download(media.storage_path);
    if (file.error || !file.data) throw new Error(`Imagem de teste indisponível: ${media.id}`);
    const sourceVariant = await db.from('content_variants').select('*').eq('id', media.variant_id).single();
    if (sourceVariant.error) throw sourceVariant.error;
    const sourceContent = await db.from('content_items').select('*').eq('id', sourceVariant.data.content_id).single();
    if (sourceContent.error) throw sourceContent.error;
    const contentId = randomUUID(), variantId = randomUUID();
    const path = `workspace/${target.workspaceId}/content/${contentId}/${variantId}-${media.position}-final.png`;
    const bytes = new Uint8Array(await file.data.arrayBuffer());
    const reservation = await db.rpc('reserve_account_storage',
      { w: target.workspaceId, u: target.userId, p: path, n: bytes.byteLength });
    if (reservation.error) throw reservation.error;
    try {
      const uploaded = await db.storage.from('brand-assets').upload(path, bytes, { contentType: 'image/png' });
      if (uploaded.error) throw uploaded.error;
    } finally {
      const released = await db.rpc('release_account_storage', { p: path, ticket: reservation.data });
      if (released.error) throw released.error;
    }
    const strategy = { ...(sourceContent.data.strategy || {}), reference_asset_id: null,
      source_references: [], qa_source_media_id: media.id, qa_source_content_id: sourceContent.data.id,
      qa_source_workspace_id: sourceWorkspaceId };
    const insertedContent = await db.from('content_items').insert({
      id: contentId, workspace_id: target.workspaceId, agent_id: target.agentId,
      topic: `[Teste recuperado] ${sourceContent.data.topic}`, strategy,
      status: 'AWAITING_REVIEW', approval_required: true, created_by: target.userId,
    });
    if (insertedContent.error) throw insertedContent.error;
    const variant = sourceVariant.data;
    const insertedVariant = await db.from('content_variants').insert({
      id: variantId, workspace_id: target.workspaceId, content_id: contentId,
      channel: variant.channel, title: `[Teste] ${variant.title}`, caption: variant.caption,
      hashtags: variant.hashtags, cta: variant.cta, aspect_ratio: variant.aspect_ratio,
      visual_concept: variant.visual_concept, image_prompts: variant.image_prompts,
      status: 'AWAITING_REVIEW',
    });
    if (insertedVariant.error) throw insertedVariant.error;
    const insertedMedia = await db.from('content_media').insert({
      workspace_id: target.workspaceId, variant_id: variantId, storage_path: path,
      position: media.position, aspect_ratio: media.aspect_ratio, prompt: media.prompt,
      provider: media.provider, model: media.model, generation_prompt: media.generation_prompt,
    });
    if (insertedMedia.error) throw insertedMedia.error;
    copied.add(media.id);
    count++;
  }
  return count;
}
