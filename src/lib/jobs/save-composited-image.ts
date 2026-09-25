import { uploadAccountFile } from '@/lib/account-storage';
import 'server-only';
import { applyExactAssets } from '@/lib/ai/asset-knowledge';
import type { Agent } from '@/lib/domain';
import { AppError } from '@/lib/security/context';

export type CompositedImageResult = {
  displayPath: string;
  isComposited: boolean;
  fallbackReason?: string;
};

export async function saveCompositedImage(params: {
  agent: Agent; bytes: Buffer | Uint8Array; mime: string; ratio: string;
  channel: string; expectedLogo: boolean; originalPath: string; finalPath: string;
}): Promise<CompositedImageResult> {
  if (params.finalPath === params.originalPath || params.finalPath.endsWith('-original.png')) throw new Error('internal_error');

  const finalBytes = await applyExactAssets({ imageBuffer: params.bytes, agent: params.agent,
    ratio: params.ratio, channel: params.channel, expectedLogo: params.expectedLogo });

  await uploadAccountFile({workspaceId: params.originalPath.split('/')[1], path:params.originalPath, bytes:params.bytes, contentType:params.mime, upsert:true});
  console.log('[Image Persistence]', { providerRawImageSaved: true, originalPath: params.originalPath });

  try {
    await uploadAccountFile({workspaceId: params.finalPath.split('/')[1], path:params.finalPath, bytes:finalBytes, contentType:params.expectedLogo ? 'image/png' : params.mime, upsert:true});
    console.log('[Image Persistence]', { finalImageSavedAfterComposition: true, exactAssetApplied: params.expectedLogo, finalDisplaySource: params.finalPath });
    return { displayPath: params.finalPath, isComposited: true };
  } catch (err) {
    const isQuotaError = err instanceof AppError &&
      (err.status === 413 || String(err.code).includes('quota') || String(err.message).includes('insuficiente') || String(err.message).includes('storage_quota'));
    if (isQuotaError) {
      const reason = 'storage_quota_exceeded_on_final_upload';
      console.warn('[Image Persistence] Final composited upload failed (storage quota). Falling back to original.', {
        originalPath: params.originalPath, finalPath: params.finalPath, reason,
      });
      return { displayPath: params.originalPath, isComposited: false, fallbackReason: reason };
    }
    throw err;
  }
}