export function validateFile(bytes: Uint8Array, mime: string) {
  if (bytes.length === 0 || bytes.length > 10 * 1024 * 1024) throw new Error('file_too_large');
  const signature = Array.from(bytes.slice(0, 12));
  const ascii = new TextDecoder().decode(bytes.slice(0, 12));
  const valid =
    (mime === 'image/png' && signature.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10') ||
    (mime === 'image/jpeg' &&
      signature[0] === 255 &&
      signature[1] === 216 &&
      signature[2] === 255) ||
    (mime === 'image/webp' && ascii.startsWith('RIFF') && ascii.slice(8) === 'WEBP') ||
    (mime === 'application/pdf' && ascii.startsWith('%PDF-')) ||
    (mime === 'text/plain' && !bytes.includes(0));
  if (!valid) throw new Error('invalid_input');
  return {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
  }[mime]!;
}
