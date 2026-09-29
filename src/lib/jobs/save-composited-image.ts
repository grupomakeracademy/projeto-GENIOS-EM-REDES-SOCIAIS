import { uploadAccountFile } from '@/lib/account-storage';
import 'server-only';
import { applyExactAssets } from '@/lib/ai/asset-knowledge';
import type { Agent } from '@/lib/domain';
import { AppError } from '@/lib/security/context';
import sharp from 'sharp';

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

  let sourceBytes = params.bytes;
  let normalized = false;
  const [widthRatio, heightRatio] = params.ratio.split(':').map(Number);
  if (widthRatio > 0 && heightRatio > 0) {
    const metadata = await sharp(params.bytes).metadata();
    if (!metadata.width || !metadata.height) throw new Error('invalid_output');
    if (metadata.width * heightRatio !== metadata.height * widthRatio) {
      const scale = Math.min(Math.floor(metadata.width / widthRatio), Math.floor(metadata.height / heightRatio));
      const width = scale * widthRatio;
      const height = scale * heightRatio;
      if (!width || !height) throw new Error('invalid_output');
      sourceBytes = await sharp(params.bytes).extract({
        left: Math.floor((metadata.width - width) / 2),
        top: Math.floor((metadata.height - height) / 2), width, height,
      }).png().toBuffer();
      normalized = true;
    }
  }
  const finalBytes = await applyExactAssets({ imageBuffer: sourceBytes, agent: params.agent,
    ratio: params.ratio, channel: params.channel, expectedLogo: params.expectedLogo });

  await uploadAccountFile({workspaceId: params.originalPath.split('/')[1], path:params.originalPath, bytes:params.bytes, contentType:params.mime, upsert:true});
  console.log('[Image Persistence]', { providerRawImageSaved: true, originalPath: params.originalPath });

  try {
    await uploadAccountFile({workspaceId: params.finalPath.split('/')[1], path:params.finalPath, bytes:finalBytes, contentType:normalized || params.expectedLogo ? 'image/png' : params.mime, upsert:true});
    console.log('[Image Persistence]', { finalImageSavedAfterComposition: true, exactAssetApplied: params.expectedLogo, finalDisplaySource: params.finalPath });
    return { displayPath: params.finalPath, isComposited: true };
  } catch (err) {
    const isQuotaError = err instanceof AppError &&
      (err.status === 413 || String(err.code).includes('quota') || String(err.message).includes('insuficiente') || String(err.message).includes('storage_quota'));
    if (isQuotaError && !normalized) {
      const reason = 'storage_quota_exceeded_on_final_upload';
      console.warn('[Image Persistence] Final composited upload failed (storage quota). Falling back to original.', {
        originalPath: params.originalPath, finalPath: params.finalPath, reason,
      });
      return { displayPath: params.originalPath, isComposited: false, fallbackReason: reason };
    }
    throw err;
  }
}
