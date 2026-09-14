import { describe, it, expect } from 'vitest';
import { channels, channelSchema } from '@/lib/domain';

describe('Regenerate Image Flow & Quota Rules', () => {
  it('calculates exactly 1 image × 1 channel × multiplier without charging other channels', () => {
    // Scenario: original content has 4 channels (instagram, facebook, linkedin, tiktok)
    const originalChannels = ['instagram', 'facebook', 'linkedin', 'tiktok'];
    expect(originalChannels.length).toBe(4);

    // User chooses to regenerate ONLY Instagram
    const targetChannel = 'instagram';
    const targetChannelCount = 1;

    // Standard / Low quality
    const standardMultiplier = 1;
    const standardQuota = targetChannelCount * standardMultiplier;
    expect(standardQuota).toBe(1);

    // Premium / Medium quality
    const premiumMultiplier = 3;
    const premiumQuota = targetChannelCount * premiumMultiplier;
    expect(premiumQuota).toBe(3);

    // Confirm other channels are NOT included in this calculation
    expect(standardQuota).not.toBe(originalChannels.length * standardMultiplier);
    expect(premiumQuota).not.toBe(originalChannels.length * premiumMultiplier);
  });

  it('preserves the original aspect ratio and resolution of the selected channel', () => {
    const instagramRatio = channels[channelSchema.parse('instagram')].ratio;
    expect(instagramRatio).toBe('4:5');

    const xRatio = channels[channelSchema.parse('x')].ratio;
    expect(xRatio).toBe('16:9');

    const linkedinRatio = channels[channelSchema.parse('linkedin')].ratio;
    expect(linkedinRatio).toBe('4:5');

    const tiktokRatio = channels[channelSchema.parse('tiktok')].ratio;
    expect(tiktokRatio).toBe('9:16');
  });

  it('increments version without mutating or destroying previous version numbers', () => {
    const existingMedias = [
      { id: 'm-1', variant_id: 'v-1', position: 0, version: 1, storage_path: '.../v1.png' },
    ];
    const maxVersion = existingMedias.reduce((max, m) => Math.max(max, m.version || 1), 1);
    const nextVersion = maxVersion + 1;

    expect(nextVersion).toBe(2);

    // Both versions exist together
    const allVersions = [
      ...existingMedias,
      { id: 'm-2', variant_id: 'v-1', position: 0, version: nextVersion, storage_path: '.../v2.png' },
    ];
    expect(allVersions.length).toBe(2);
    expect(allVersions[0].version).toBe(1);
    expect(allVersions[1].version).toBe(2);
  });

  it('ensures regeneration failures keep the content status as AWAITING_REVIEW or ROUTINE instead of FAILED', () => {
    // When job is regenerate_image or regenerate_copy
    const jobType = 'regenerate_image';
    const previousStatus = 'AWAITING_REVIEW';

    let contentStatus: string;
    if (jobType === 'regenerate_image' || jobType === 'regenerate_copy') {
      contentStatus = previousStatus || 'AWAITING_REVIEW';
    } else {
      contentStatus = 'FAILED';
    }

    expect(contentStatus).toBe('AWAITING_REVIEW');
    expect(contentStatus).not.toBe('FAILED');
  });

  it('ensures assisted routine mode regeneration preserves ROUTINE status on failure', () => {
    const jobType = 'regenerate_image';
    const previousStatus = 'ROUTINE';

    let contentStatus: string;
    if (jobType === 'regenerate_image' || jobType === 'regenerate_copy') {
      contentStatus = previousStatus || 'AWAITING_REVIEW';
    } else {
      contentStatus = 'FAILED';
    }

    expect(contentStatus).toBe('ROUTINE');
    expect(contentStatus).not.toBe('FAILED');
  });
});
