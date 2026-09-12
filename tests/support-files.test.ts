import { it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { validateSupportFile, MAX_SUPPORT_FILE } from '@/lib/support/files';
it('rejects mismatching extensions, MIME and file signatures', () => {
  expect(() => validateSupportFile('photo.png', 'image/png', Buffer.from('not an image'))).toThrow(
    'support_invalid_file',
  );
  expect(() =>
    validateSupportFile('payload.exe', 'image/png', Buffer.from('89504e470d0a1a0a', 'hex')),
  ).toThrow();
  expect(() => validateSupportFile('file.pdf', 'image/png', Buffer.from('%PDF-1.7'))).toThrow();
  expect(() => validateSupportFile('data.csv', 'text/csv', Buffer.from([0, 255, 0]))).toThrow();
});
it('accepts supported signatures and rejects oversized files', () => {
  expect(validateSupportFile('report.pdf', 'application/pdf', Buffer.from('%PDF-1.7\n')).mime).toBe(
    'application/pdf',
  );
  expect(
    validateSupportFile('dados.csv', 'text/csv', Buffer.from('nome,total\nTeste,1')).name,
  ).toBe('dados.csv');
  expect(() =>
    validateSupportFile('large.txt', 'text/plain', Buffer.alloc(MAX_SUPPORT_FILE + 1)),
  ).toThrow('file_too_large');
});
