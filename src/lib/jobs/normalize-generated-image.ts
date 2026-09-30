import sharp from 'sharp';

/** Validate the provider's native frame before the exact asset is composited.
 * Never hide a ratio mismatch with a crop, stretched image or outer frame. */
export async function normalizeGeneratedImage(bytes: Buffer | Uint8Array, ratio: string): Promise<Buffer> {
  const [rw, rh] = ratio.split(':').map(Number);
  if (!Number.isInteger(rw) || !Number.isInteger(rh) || rw <= 0 || rh <= 0) throw new Error('invalid_output');
  const meta = await sharp(bytes).metadata();
  if (!meta.width || !meta.height) throw new Error('invalid_output');
  if (meta.width * rh !== meta.height * rw) {
    console.error('[Image Frame] Provider returned unexpected dimensions', {
      actual: `${meta.width}x${meta.height}`, expectedRatio: ratio,
    });
    throw new Error('provider_ratio_mismatch');
  }
  return Buffer.from(bytes);
}
