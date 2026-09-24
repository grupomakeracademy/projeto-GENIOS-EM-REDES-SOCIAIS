export const MAX_IMPORT_VIDEO_BYTES = 500 * 1024 * 1024;

/** Read ISO BMFF metadata only. The uploaded bytes are never rewritten. */
export function mp4Dimensions(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (at: number, size: number) => String.fromCharCode(...bytes.subarray(at, at + size));
  function boxes(start: number, end: number) {
    const out: { type: string; start: number; end: number }[] = [];
    for (let at = start; at < end;) {
      if (end - at < 8) throw new Error('invalid_input');
      let size = view.getUint32(at), header = 8;
      if (size === 1) {
        if (end - at < 16) throw new Error('invalid_input');
        const large = view.getBigUint64(at + 8);
        if (large > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('invalid_input');
        size = Number(large); header = 16;
      }
      if (size === 0) size = end - at;
      if (size < header || at + size > end) throw new Error('invalid_input');
      out.push({ type: text(at + 4, 4), start: at + header, end: at + size }); at += size;
    }
    return out;
  }
  if (!bytes.length || bytes.length > MAX_IMPORT_VIDEO_BYTES) throw new Error('file_too_large');
  const top = boxes(0, bytes.length), ftyp = top.find(b => b.type === 'ftyp'), moov = top.find(b => b.type === 'moov');
  if (!ftyp || ftyp.end - ftyp.start < 8 || !moov || !top.some(b => b.type === 'mdat' && b.end > b.start)) throw new Error('invalid_input');
  const brands = [text(ftyp.start, 4)];
  for (let at = ftyp.start + 8; at + 4 <= ftyp.end; at += 4) brands.push(text(at, 4));
  if (!brands.some(b => ['isom','iso2','iso4','iso5','iso6','mp41','mp42','avc1','M4V '].includes(b))) throw new Error('invalid_input');
  for (const track of boxes(moov.start, moov.end).filter(b => b.type === 'trak')) {
    const parts = boxes(track.start, track.end), tkhd = parts.find(b => b.type === 'tkhd'), mdia = parts.find(b => b.type === 'mdia');
    if (!tkhd || !mdia) continue;
    const handler = boxes(mdia.start, mdia.end).find(b => b.type === 'hdlr');
    if (!handler || handler.end - handler.start < 12 || text(handler.start + 8, 4) !== 'vide') continue;
    const version = view.getUint8(tkhd.start), matrix = tkhd.start + (version === 1 ? 52 : 40);
    if (![0,1].includes(version) || matrix + 44 > tkhd.end) throw new Error('invalid_input');
    let width = Math.round(view.getUint32(matrix + 36) / 65536), height = Math.round(view.getUint32(matrix + 40) / 65536);
    if (view.getInt32(matrix) === 0 && view.getInt32(matrix + 16) === 0 && view.getInt32(matrix + 4) !== 0) [width,height] = [height,width];
    if (width > 0 && height > 0) return { width, height };
  }
  throw new Error('invalid_input');
}
