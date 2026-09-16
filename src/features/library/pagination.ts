export function pageBlock(page: number, total: number) {
  const count = Math.ceil(total / 24);
  const start = Math.floor((Math.max(1, page) - 1) / 5) * 5 + 1;
  return Array.from({ length: Math.max(0, Math.min(5, count - start + 1)) }, (_, i) => start + i);
}
