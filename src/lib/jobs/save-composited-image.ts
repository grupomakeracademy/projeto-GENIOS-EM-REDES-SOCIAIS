import { uploadAccountFile } from '@/lib/account-storage';
import 'server-only';
import { applyExactAssets } from '@/lib/ai/asset-knowledge';
import type { Agent } from '@/lib/domain';

/** Shared by manual, routine and regeneration. No caller receives a raw display path. */
export async function saveCompositedImage(params: {
  agent: Agent; bytes: Buffer | Uint8Array; mime: string; ratio: string;
  channel: string; expectedLogo: boolean; originalPath: string; finalPath: string;
}) {
  if (params.finalPath === params.originalPath || params.finalPath.endsWith('-original.png')) throw new Error('internal_error');
  const finalBytes = await applyExactAssets({ imageBuffer: params.bytes, agent: params.agent,
    ratio: params.ratio, channel: params.channel, expectedLogo: params.expectedLogo });
  if (params.expectedLogo && Buffer.from(params.bytes).equals(finalBytes)) throw new Error('internal_error');
  await uploadAccountFile({workspaceId: params.originalPath.split('/')[1], path:params.originalPath,bytes:params.bytes,contentType:params.mime,upsert:true});
  console.log('[Image Persistence]', { providerRawImageSaved: true });
  await uploadAccountFile({workspaceId: params.finalPath.split('/')[1],path:params.finalPath,bytes:finalBytes,contentType:params.expectedLogo ? 'image/png' : params.mime,upsert:true});
  console.log('[Image Persistence]', { finalImageSavedAfterComposition: true, exactAssetApplied: params.expectedLogo,
    finalDisplaySource: params.finalPath });
  return params.finalPath;
}
