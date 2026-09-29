import 'server-only';
import { adminClient } from '@/lib/supabase/server';
import { AppError, checked } from '@/lib/security/context';

/** A generated image may use only a processed general visual reference linked to its agent. */
export async function requireSelectedReference(
  workspaceId: string,
  agentId: string,
  referenceAssetId?: string,
  verifyFile = false,
  allowStaged = false,
) {
  if (!referenceAssetId) return null;
  const db = adminClient();
  const agent = checked(await db.from('agents')
    .select('visual_settings')
    .eq('id', agentId).eq('workspace_id', workspaceId).maybeSingle());
  const linkedIds = agent?.visual_settings?.reference_ids;
  if (!Array.isArray(linkedIds) || !linkedIds.includes(referenceAssetId))
    throw new AppError('A imagem de referência não está associada ao agente selecionado.', 400);

  const asset = checked(await db.from('assets')
    .select('id,name,mime_type,storage_path,summary_text,processing_status,category,asset_subtype')
    .eq('id', referenceAssetId).eq('workspace_id', workspaceId).maybeSingle());
  const ready = asset?.processing_status === 'processed' && Boolean(asset.summary_text?.trim()) &&
    (!asset.asset_subtype || (allowStaged && asset.asset_subtype === 'content_reference_staged'));
  const staged = allowStaged && asset?.asset_subtype === 'content_reference_staged' &&
    ['pending', 'failed', 'processing'].includes(asset.processing_status);
  if (!asset || asset.category !== 'reference' || !asset.mime_type.startsWith('image/') ||
      (!ready && !staged))
    throw new AppError('A imagem de referência precisa estar processada no DNA Visual Geral.', 400);
  if (verifyFile) {
    const file = await db.storage.from('brand-assets').download(asset.storage_path);
    if (file.error || !file.data)
      throw new AppError('O arquivo da imagem de referência não está disponível no armazenamento.', 400);
  }
  return asset;
}
