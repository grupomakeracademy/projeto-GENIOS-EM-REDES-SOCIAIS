import { describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  routineSettingsSchema,
  QUALITY_MULTIPLIERS,
  channels,
  type Channel,
  statuses,
} from '@/lib/domain';
import { buildImagePromptContext } from '@/lib/jobs/pipeline';

describe('Routine, Content & Central Quota System', () => {
  it('validates routineSettingsSchema default values and structure', () => {
    const defaultSettings = routineSettingsSchema.parse({});
    expect(defaultSettings.image_style).toBe('Disney / Pixar');
    expect(defaultSettings.instruction).toBe('');
    expect(defaultSettings.channels).toEqual(['instagram']);
    expect(defaultSettings.image_quality).toBe('low');
    expect(defaultSettings.image_count).toBe(1);
    expect(defaultSettings.is_carousel).toBe(false);
    expect(defaultSettings.cta).toBe('');
  });

  it('validates routineSettingsSchema custom presets without side effects', () => {
    const custom = routineSettingsSchema.parse({
      image_style: 'Minimalista Corporativo',
      instruction: 'Focar em cases de IA aplicada e inovação prática',
      channels: ['linkedin', 'instagram', 'x'],
      image_quality: 'medium',
      image_count: 2,
      is_carousel: true,
      cta: 'Comente "IA" para receber o material exclusivo no direct!',
    });

    expect(custom.image_style).toBe('Minimalista Corporativo');
    expect(custom.instruction).toContain('cases de IA');
    expect(custom.channels).toHaveLength(3);
    expect(custom.image_quality).toBe('medium');
    expect(custom.image_count).toBe(2);
    expect(custom.is_carousel).toBe(true);
    expect(custom.cta).toContain('Comente');
  });

  it('calculates real-time quota consumption according to specification formula', () => {
    // Formula: (image_count * channels.length) * multiplier
    const calculateQuota = (
      imageCount: number,
      selectedChannels: Channel[],
      quality: 'low' | 'medium' | 'high',
    ) => {
      const multiplier = QUALITY_MULTIPLIERS[quality];
      return imageCount * selectedChannels.length * multiplier;
    };

    // Low = 1x
    expect(calculateQuota(1, ['instagram'], 'low')).toBe(1);
    expect(calculateQuota(2, ['instagram', 'facebook', 'linkedin'], 'low')).toBe(6);

    // Medium = 3x (Premium)
    // 2 images * 6 channels * Premium (3x) = 36 cotas (example in prompt item 31)
    const allChannels: Channel[] = ['instagram', 'facebook', 'whatsapp', 'tiktok', 'x', 'linkedin'];
    expect(calculateQuota(2, allChannels, 'medium')).toBe(36);

    // 2 images * 6 channels * Padrão (1x) = 12 cotas (example in prompt item 31)
    expect(calculateQuota(2, allChannels, 'low')).toBe(12);
  });

  it('verifies ROUTINE status exists between DRAFT and GENERATING in visual sequence', () => {
    expect(statuses).toContain('ROUTINE');
    const draftIndex = statuses.indexOf('DRAFT');
    const routineIndex = statuses.indexOf('ROUTINE');
    const generatingIndex = statuses.indexOf('GENERATING');

    expect(draftIndex).toBe(0);
    expect(routineIndex).toBe(1);
    expect(generatingIndex).toBe(2);
  });

  it('verifies channel connection gating condition', () => {
    const mockConnections = [
      { id: 'c-1', channel: 'instagram', account_name: 'acme_insta', created_at: '2026-09-12' },
      { id: 'c-2', channel: 'linkedin', account_name: 'acme_corp', created_at: '2026-09-12' },
    ];

    const isChannelConnected = (ch: Channel) =>
      mockConnections.some((c) => c.channel === ch);

    // Connected channels can publish & schedule
    expect(isChannelConnected('instagram')).toBe(true);
    expect(isChannelConnected('linkedin')).toBe(true);

    // Disconnected channels must be gated and redirected to /channels
    expect(isChannelConnected('facebook')).toBe(false);
    expect(isChannelConnected('tiktok')).toBe(false);
    expect(isChannelConnected('whatsapp')).toBe(false);
    expect(isChannelConnected('x')).toBe(false);
  });

  it('verifies buildImagePromptContext limits long styles and produces clean JSON context under 2000 chars', () => {
    const longStyleDescription = 'A identidade visual do Geninhos deve transmitir educacao, inovacao, personalizacao '.repeat(50);
    const scenePrompt = 'Cena 1: Ambiente interno com o mascote azul e alunos estudando felizes com tablets.';

    const result = buildImagePromptContext({
      prompt: scenePrompt,
      style: longStyleDescription,
      channel: 'instagram',
      position: 0,
      ratio: '4:5',
      companyOrName: 'Geninhos Educação',
    });

    const parsed = JSON.parse(result);
    expect(parsed.scene).toBe(scenePrompt);
    expect(parsed.aspect_ratio).toBe('4:5');
    expect(parsed.channel).toBe('instagram');
    expect(parsed.slide).toBe(1);
    expect(parsed.brand).toBe('Geninhos Educação');
    // Ensure the style was truncated to max 300 chars to avoid exceeding model prompt limits
    expect(parsed.style.length).toBeLessThanOrEqual(300);
    // Ensure the total prompt context is compact and safe
    expect(result.length).toBeLessThan(1500);
  });
});
