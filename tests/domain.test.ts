import { describe, it, expect } from 'vitest';
import { canTransition, permitted, channels, validateVariants, fitCaptionToLimit } from '@/lib/domain';
import { nextOccurrence, backoff } from '@/lib/jobs/scheduling';
import { encrypt, decrypt } from '@/lib/security/crypto';
import { validateFile } from '@/lib/security/uploads';
describe('content lifecycle', () => {
  it('approval never publishes', () => {
    expect(canTransition('AWAITING_REVIEW', 'PUBLISHED')).toBe(false);
    expect(canTransition('AWAITING_REVIEW', 'APPROVED')).toBe(true);
  });
  it('published content is immutable except archive', () => {
    expect(canTransition('PUBLISHED', 'GENERATING')).toBe(false);
    expect(canTransition('PUBLISHED', 'ARCHIVED')).toBe(true);
  });
  it('enforces role boundaries', () => {
    expect(permitted('VIEWER', 'write')).toBe(false);
    expect(permitted('EDITOR', 'admin')).toBe(false);
    expect(permitted('EDITOR', 'write')).toBe(true);
  });
  it('keeps real social ratios', () => {
    expect(channels.tiktok.ratio).toBe('9:16');
    expect(channels.instagram.ratio).toBe('4:5');
    expect(channels.x.ratio).toBe('16:9');
  });
  it('rejects mismatched generated channels', () => {
    expect(() => validateVariants([], ['instagram'], 1)).toThrow('invalid_output');
  });
  it('safely fits captions to channel limits without throwing', () => {
    const longCaption = 'Texto muito longo para o X ' + 'A'.repeat(300) + ' #Hashtag1 #Hashtag2';
    const fitted = fitCaptionToLimit(longCaption, 280);
    expect(fitted.length).toBeLessThanOrEqual(280);

    const variants = [
      {
        channel: 'x' as const,
        caption: 'Uma legenda com mais de 280 caracteres ' + 'x'.repeat(270) + ' #Hashtag',
        image_prompts: ['prompt 1'],
      },
    ];
    validateVariants(variants, ['x'], 1);
    expect(variants[0].caption.length).toBeLessThanOrEqual(280);
  });
});
describe('scheduling', () => {
  it('uses the workspace timezone', () => {
    expect(
      nextOccurrence(
        '08:00',
        [1, 2, 3, 4, 5, 6, 7],
        'America/Sao_Paulo',
        new Date('2026-09-11T10:00:00Z'),
      ).toISOString(),
    ).toBe('2026-09-11T11:00:00.000Z');
  });
  it('skips DST gaps', () => {
    expect(
      nextOccurrence(
        '02:30',
        [7],
        'America/New_York',
        new Date('2026-03-08T05:00:00Z'),
      ).toISOString(),
    ).toBe('2026-03-15T06:30:00.000Z');
  });
  it('does not run twice during a DST overlap', () => {
    expect(
      nextOccurrence(
        '01:30',
        [7],
        'America/New_York',
        new Date('2026-11-01T05:45:00Z'),
      ).toISOString(),
    ).toBe('2026-11-08T06:30:00.000Z');
  });
  it('rejects invalid schedules', () => {
    expect(() => nextOccurrence('25:00', [1], 'UTC')).toThrow();
    expect(() => nextOccurrence('08:00', [], 'UTC')).toThrow();
  });
  it('bounds retries', () => {
    expect(backoff(1)).toBe(30);
    expect(backoff(20)).toBe(3600);
  });
});
describe('secrets and uploads', () => {
  it('binds encrypted credentials to the tenant and provider', () => {
    process.env.CREDENTIAL_MASTER_KEY = Buffer.alloc(32, 7).toString('base64');
    const encrypted = encrypt('test-secret', 'a:openai');
    expect(decrypt(encrypted, 'a:openai')).toBe('test-secret');
    expect(() => decrypt(encrypted, 'b:openai')).toThrow();
    expect(encrypted).not.toContain('test-secret');
  });
  it('rejects MIME spoofing and executable SVG', () => {
    expect(() => validateFile(new TextEncoder().encode('<svg/>'), 'image/png')).toThrow();
    expect(() => validateFile(new TextEncoder().encode('<svg/>'), 'image/svg+xml')).toThrow();
  });
});
