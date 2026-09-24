import { z } from 'zod';

export const MAX_IMPORT_IMAGES = 6;
export const MAX_IMPORT_IMAGE_BYTES = 10 * 1024 * 1024;
export const importImageSchema = z.object({
  storage_path: z.string().min(1),
  mime_type: z.enum(['image/jpeg', 'image/png', 'image/webp', 'video/mp4']),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type ImportImage = z.infer<typeof importImageSchema>;
export type ImportPreviewImage = ImportImage & { url: string };

// Older imports retain their first-image columns for backward compatibility.
export function importImages(row: {
  images?: unknown;
  storage_path: string;
  mime_type: string;
  width: number;
  height: number;
}): ImportImage[] {
  if (Array.isArray(row.images) && row.images.length) {
    const media = z.array(importImageSchema).min(1).max(MAX_IMPORT_IMAGES).parse(row.images);
    if (media.some(m => m.mime_type === 'video/mp4') && media.length !== 1) throw new Error('invalid_import_images');
    return media;
  }
  return [importImageSchema.parse(row)];
}
