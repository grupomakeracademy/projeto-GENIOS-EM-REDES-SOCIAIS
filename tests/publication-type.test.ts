import { describe, expect, it } from 'vitest';
import { channels, publicationChannels, publicationRatio, publicationSelectionValid, routineSettingsSchema } from '@/lib/domain';

describe('tipo de publicação compartilhado', () => {
  it('mantém as seis redes e as proporções atuais no Feed', () => {
    expect(publicationChannels.feed).toEqual(['instagram', 'facebook', 'whatsapp', 'tiktok', 'x', 'linkedin']);
    for (const channel of publicationChannels.feed) expect(publicationRatio('feed', channel)).toBe(channels[channel].ratio);
  });

  it('restringe Stories a quatro redes verticais', () => {
    expect(publicationChannels.stories).toEqual(['instagram', 'facebook', 'whatsapp', 'tiktok']);
    for (const channel of publicationChannels.stories) expect(publicationRatio('stories', channel)).toBe('9:16');
    expect(publicationSelectionValid('stories', ['instagram', 'facebook'])).toBe(true);
    expect(publicationSelectionValid('stories', ['instagram', 'x'])).toBe(false);
    expect(publicationSelectionValid('stories', ['linkedin'])).toBe(false);
  });

  it('interpreta rotinas antigas como Feed e valida rotinas Stories', () => {
    expect(routineSettingsSchema.parse({ channels: ['linkedin'] }).publication_type).toBe('feed');
    expect(routineSettingsSchema.parse({ channels: ['instagram'], publication_type: 'stories', destination: 'stories' }).publication_type).toBe('stories');
    expect(routineSettingsSchema.safeParse({ channels: ['x'], publication_type: 'stories', destination: 'stories' }).success).toBe(false);
    expect(routineSettingsSchema.safeParse({ channels: ['instagram'], publication_type: 'stories', destination: 'feed' }).success).toBe(false);
  });
});
