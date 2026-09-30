import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { normalizeGeneratedImage } from '@/lib/jobs/normalize-generated-image';

describe('final image frame', () => {
  it.each([
    [1024, 1024, '1:1'], [1024, 1280, '4:5'], [960, 1280, '3:4'],
    [864, 1536, '9:16'], [1536, 864, '16:9'],
  ])('preserves every source pixel at native %ix%i (%s)', async (width, height, ratio) => {
    const source = await sharp({ create: { width, height, channels: 3, background: '#eeeeee' } })
      .composite([{ input: { create: { width: 30, height: 30, channels: 3, background: '#ff0000' } }, left: 0, top: 0 }])
      .png().toBuffer();
    const final = await normalizeGeneratedImage(source, ratio);
    expect(final).toEqual(source);
    expect((await sharp(final).metadata()).width).toBe(width);
  });

  it('rejects a provider ratio mismatch instead of cropping or creating a border', async () => {
    const source = await sharp({ create: { width: 1024, height: 1536, channels: 3, background: '#eeeeee' } }).png().toBuffer();
    await expect(normalizeGeneratedImage(source, '4:5')).rejects.toThrow('provider_ratio_mismatch');
  });
});
