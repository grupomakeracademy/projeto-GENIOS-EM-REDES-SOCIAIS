import { AppError } from './context';

export function validateFile(bytes: Uint8Array, mimeInput: string) {
  if (bytes.length === 0 || bytes.length > 10 * 1024 * 1024) throw new AppError('file_too_large', 413);

  // Normalize common MIME variations (e.g. Windows image/jpg, image/pjpeg)
  const mime = mimeInput === 'image/jpg' || mimeInput === 'image/pjpeg' ? 'image/jpeg' : mimeInput;

  const isPng =
    mime === 'image/png' &&
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;

  const isJpeg =
    mime === 'image/jpeg' &&
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;

  // WebP has 'RIFF' at 0..3 and 'WEBP' at 8..11 with 32-bit length in 4..7 (which may contain arbitrary bytes)
  const isWebp =
    mime === 'image/webp' &&
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;

  const isPdf =
    mime === 'application/pdf' &&
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d;

  const isText = mime === 'text/plain' && !bytes.includes(0);

  const valid = isPng || isJpeg || isWebp || isPdf || isText;
  if (!valid) throw new AppError('invalid_input', 400);

  return {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
  }[mime]!;
}
