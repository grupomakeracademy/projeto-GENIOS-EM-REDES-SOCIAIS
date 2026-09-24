import { describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  canTransition,
  permitted,
  channels,
  statuses,
  agentSchema,
  validateVariants,
  fitCaptionToLimit,
} from '@/lib/domain';
import { nextOccurrence, backoff } from '@/lib/jobs/scheduling';
import { encrypt, decrypt } from '@/lib/security/crypto';
import { validateFile } from '@/lib/security/uploads';
describe('content lifecycle', () => {
  it('places ROUTINE between DRAFT and GENERATING', () => {
    const draftIndex = statuses.indexOf('DRAFT');
    const routineIndex = statuses.indexOf('ROUTINE');
    const generatingIndex = statuses.indexOf('GENERATING');
    expect(routineIndex).toBe(draftIndex + 1);
    expect(generatingIndex).toBe(routineIndex + 1);
  });
  it('handles ROUTINE status transitions', () => {
    expect(canTransition('DRAFT', 'ROUTINE')).toBe(true);
    expect(canTransition('GENERATING', 'ROUTINE')).toBe(true);
    expect(canTransition('ROUTINE', 'APPROVED')).toBe(true);
    expect(canTransition('ROUTINE', 'REJECTED')).toBe(true);
    expect(canTransition('ROUTINE', 'PUBLISHED')).toBe(false);
    expect(canTransition('APPROVED', 'ROUTINE')).toBe(true);
  });
  it('safely migrates agent mode MANUAL to ASSISTED and validates modes', () => {
    const baseAgent = {
      name: 'Agente de Teste',
      briefing: {},
      text_settings: {},
      visual_settings: {},
      channel_settings: {},
      channels: ['instagram' as const],
      content_language: 'pt-BR',
      approval_required: true,
      research_enabled: true,
      image_count: 1,
      active: true,
    };
    const manualParsed = agentSchema.parse({ ...baseAgent, mode: 'MANUAL' });
    expect(manualParsed.mode).toBe('ASSISTED');

    const assistedParsed = agentSchema.parse({ ...baseAgent, mode: 'ASSISTED' });
    expect(assistedParsed.mode).toBe('ASSISTED');

    const autonomousParsed = agentSchema.parse({ ...baseAgent, mode: 'AUTONOMOUS' });
    expect(autonomousParsed.mode).toBe('AUTONOMOUS');
  });
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
        title: 'Teste',
        hashtags: [],
        cta: '',
        visual_concept: '',
        caption: 'Uma legenda com mais de 280 caracteres ' + 'x'.repeat(270) + ' #Hashtag',
        image_prompts: ['prompt 1'],
      },
    ];
    validateVariants(variants, ['x'], 1);
    expect(variants[0].caption.length).toBeLessThanOrEqual(280);
  });
  it('gracefully adapts image_prompts count without throwing invalid_output', () => {
    const variants = [
      {
        channel: 'instagram' as const,
        title: 'Carrossel',
        hashtags: [],
        cta: '',
        visual_concept: '',
        caption: 'Legenda Instagram',
        image_prompts: ['slide 1', 'slide 2', 'slide 3', 'slide 4', 'slide 5'],
      },
    ];
    // Excess prompts (5 returned, 1 requested) are sliced to requested count
    validateVariants(variants, ['instagram'], 1);
    expect(variants[0].image_prompts.length).toBe(1);
    expect(variants[0].image_prompts[0]).toBe('slide 1');

    // Insufficient prompts (1 returned, 3 requested) are padded to requested count
    validateVariants(variants, ['instagram'], 3);
    expect(variants[0].image_prompts.length).toBe(3);
    expect(variants[0].image_prompts).toEqual(['slide 1', 'slide 1', 'slide 1']);

    // Zero count requested
    validateVariants(variants, ['instagram'], 0);
    expect(variants[0].image_prompts).toEqual([]);
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
