export function mediaDisplaySource(path: string): string {
  if (path.endsWith('-original.png')) throw new Error('internal_error');
  console.log('[Image Display]', { uiUsingPostProcessedImage: path.endsWith('-final.png'), finalDisplaySource: path });
  return path;
}
