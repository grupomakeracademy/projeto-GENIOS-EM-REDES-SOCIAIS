import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
function master() {
  const key = Buffer.from(process.env.CREDENTIAL_MASTER_KEY || '', 'base64');
  if (key.length !== 32) throw new Error('setup_required');
  return key;
}
export function encrypt(value: string, aad: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', master(), iv);
  cipher.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((b) => b.toString('base64')).join('.');
}
export function decrypt(value: string, aad: string) {
  const [iv, tag, data] = value.split('.').map((s) => Buffer.from(s, 'base64'));
  const cipher = createDecipheriv('aes-256-gcm', master(), iv);
  cipher.setAAD(Buffer.from(aad));
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8');
}
