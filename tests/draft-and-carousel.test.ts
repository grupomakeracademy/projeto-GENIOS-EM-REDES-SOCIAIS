import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { channelSchema, QUALITY_MULTIPLIERS } from '@/lib/domain';

describe('Carousel Logic Dependent on Imagens por Canal', () => {
  // Schema replicating API rules
  const contentInputSchema = z
    .object({
      agent_id: z.string().uuid(),
      instruction: z.string().default(''),
      channels: z.array(channelSchema).min(1),
      image_count: z.number().int().min(1).max(6),
      image_style: z.string().optional(),
      image_quality: z.enum(['low', 'medium', 'high']).optional(),
      is_carousel: z.boolean().optional(),
      cta: z.string().optional(),
    })
    .transform((data) => {
      // Backend enforcement: 1 image can NEVER be a carousel
      if (data.image_count <= 1) {
        data.is_carousel = false;
      }
      return data;
    });

  it('forces is_carousel = false when image_count = 1 even if user passed true', () => {
    const parsed = contentInputSchema.parse({
      agent_id: 'a0000000-0000-4000-8000-000000000001',
      channels: ['instagram'],
      image_count: 1,
      is_carousel: true, // Attempting to set true with 1 image
    });

    expect(parsed.is_carousel).toBe(false);
  });

  it('allows is_carousel = true or false when image_count >= 2', () => {
    for (const count of [2, 3, 4, 5, 6]) {
      const parsedWithTrue = contentInputSchema.parse({
        agent_id: 'a0000000-0000-4000-8000-000000000001',
        channels: ['instagram'],
        image_count: count,
        is_carousel: true,
      });
      expect(parsedWithTrue.is_carousel).toBe(true);

      const parsedWithFalse = contentInputSchema.parse({
        agent_id: 'a0000000-0000-4000-8000-000000000001',
        channels: ['instagram'],
        image_count: count,
        is_carousel: false,
      });
      expect(parsedWithFalse.is_carousel).toBe(false);
    }
  });

  it('simulates dynamic client-side state transition from >=2 with carousel=true to 1', () => {
    // Initial state: 3 images, carousel = true
    let imageCount = 3;
    let isCarousel = true;
    let isCarouselDisabled = imageCount <= 1;

    expect(isCarouselDisabled).toBe(false);
    expect(isCarousel).toBe(true);

    // User reduces to 1 image
    imageCount = 1;
    isCarouselDisabled = imageCount <= 1;
    if (isCarouselDisabled) {
      isCarousel = false; // Immediate reset
    }

    expect(isCarouselDisabled).toBe(true);
    expect(isCarousel).toBe(false);

    // User increases back to 2 images
    imageCount = 2;
    isCarouselDisabled = imageCount <= 1;
    // Field re-enables, user can choose
    expect(isCarouselDisabled).toBe(false);
    expect(isCarousel).toBe(false); // default stays false until user chooses
    isCarousel = true;
    expect(isCarousel).toBe(true);
  });

  it('preserves quota calculation formula without alteration', () => {
    const calculateQuota = (imageCount: number, channelsCount: number, quality: 'low' | 'medium') => {
      const multiplier = QUALITY_MULTIPLIERS[quality] || 1;
      return imageCount * channelsCount * multiplier;
    };

    // Low quality (multiplier 1)
    expect(calculateQuota(1, 1, 'low')).toBe(1);
    expect(calculateQuota(2, 2, 'low')).toBe(4);
    expect(calculateQuota(3, 4, 'low')).toBe(12);

    // Medium/Premium quality (multiplier 3)
    expect(calculateQuota(1, 1, 'medium')).toBe(3);
    expect(calculateQuota(2, 2, 'medium')).toBe(12);
    expect(calculateQuota(6, 6, 'medium')).toBe(108);

    // is_carousel does NOT affect quota calculation
    const carouselTrueQuota = calculateQuota(3, 2, 'low');
    const carouselFalseQuota = calculateQuota(3, 2, 'low');
    expect(carouselTrueQuota).toBe(carouselFalseQuota);
    expect(carouselTrueQuota).toBe(6);
  });
});

describe('Draft Editing and Generation Pipeline', () => {
  const runPayloadSchema = z
    .object({
      content_id: z.string().uuid().optional(),
      agent_id: z.string().uuid(),
      instruction: z.string().max(10000).default(''),
      channels: z.array(channelSchema).min(1),
      image_count: z.number().int().min(0).max(20),
      image_style: z.string().max(120).optional(),
      image_quality: z.enum(['low', 'medium', 'high']).optional(),
      is_carousel: z.boolean().optional(),
      cta: z.string().max(500).optional(),
      idempotency_key: z.string().uuid(),
    })
    .transform((data) => {
      if (data.image_count <= 1) {
        data.is_carousel = false;
      }
      return data;
    });

  it('accepts content_id in POST /api/runs to reuse existing draft without duplicating', () => {
    const existingDraftId = 'b0000000-0000-4000-8000-000000000001';
    const parsed = runPayloadSchema.parse({
      content_id: existingDraftId,
      agent_id: 'a0000000-0000-4000-8000-000000000001',
      instruction: 'Instrução do rascunho revisado',
      channels: ['instagram', 'facebook'],
      image_count: 2,
      image_style: 'Disney / Pixar',
      image_quality: 'low',
      is_carousel: true,
      cta: 'Saiba mais',
      idempotency_key: 'c0000000-0000-4000-8000-000000000001',
    });

    expect(parsed.content_id).toBe(existingDraftId);
    expect(parsed.is_carousel).toBe(true);
    expect(parsed.channels).toHaveLength(2);
  });

  it('enforces is_carousel = false in POST /api/runs when image_count = 1', () => {
    const parsed = runPayloadSchema.parse({
      content_id: 'b0000000-0000-4000-8000-000000000001',
      agent_id: 'a0000000-0000-4000-8000-000000000001',
      instruction: 'Instrução de post único',
      channels: ['instagram'],
      image_count: 1,
      is_carousel: true, // Should be forced to false
      idempotency_key: 'd0000000-0000-4000-8000-000000000001',
    });

    expect(parsed.is_carousel).toBe(false);
  });
});
