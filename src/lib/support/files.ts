import 'server-only';
import { AppError } from '@/lib/security/context';
export const MAX_SUPPORT_FILE = 50 * 1024 * 1024;
const mimeByExt: Record<string, string[]> = {
  pdf: ['application/pdf'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  txt: ['text/plain'],
  csv: ['text/csv', 'application/vnd.ms-excel', 'text/plain'],
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  webp: ['image/webp'],
  xls: ['application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  mp3: ['audio/mpeg'],
  wav: ['audio/wav', 'audio/x-wav'],
  mp4: ['video/mp4'],
};
export function validateSupportFile(name: string, mime: string, bytes: Buffer) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (!bytes.length || bytes.length > MAX_SUPPORT_FILE) throw new AppError('file_too_large', 413);
  if (!mimeByExt[ext]?.includes(mime)) throw new AppError('support_invalid_file');
  const starts = (hex: string) => bytes.subarray(0, hex.length / 2).equals(Buffer.from(hex, 'hex'));
  let valid = false;
  if (ext === 'pdf') valid = bytes.subarray(0, 5).toString() === '%PDF-';
  if (ext === 'png') valid = starts('89504e470d0a1a0a');
  if (ext === 'jpg' || ext === 'jpeg') valid = starts('ffd8ff');
  if (ext === 'webp')
    valid =
      bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  if (ext === 'wav')
    valid =
      bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WAVE';
  if (ext === 'mp3')
    valid =
      bytes.subarray(0, 3).toString() === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224);
  if (ext === 'mp4') valid = bytes.subarray(4, 8).toString() === 'ftyp';
  if (ext === 'doc' || ext === 'xls')
    valid =
      starts('d0cf11e0a1b11ae1') &&
      bytes.includes(Buffer.from(ext === 'doc' ? 'WordDocument' : 'Workbook', 'utf16le'));
  if (ext === 'docx' || ext === 'xlsx')
    valid =
      starts('504b0304') &&
      bytes.includes(Buffer.from('[Content_Types].xml')) &&
      bytes.includes(Buffer.from(ext === 'docx' ? 'word/document.xml' : 'xl/workbook.xml')) &&
      !bytes.includes(Buffer.from('vbaProject.bin'));
  if (ext === 'txt' || ext === 'csv') {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      valid = !bytes.includes(0);
    } catch {
      valid = false;
    }
  }
  if (!valid) throw new AppError('support_invalid_file');
  return { name: name.replace(/[\x00-\x1f/\\]/g, '_').slice(0, 180), mime: mimeByExt[ext][0] };
}
export async function boundedForm(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new AppError('invalid_input');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_SUPPORT_FILE + 1024 * 1024) {
      await reader.cancel();
      throw new AppError('file_too_large', 413);
    }
    chunks.push(value);
  }
  return new Response(Buffer.concat(chunks), {
    headers: { 'Content-Type': request.headers.get('content-type') || '' },
  }).formData();
}
