import { expect, it, vi, afterEach } from 'vitest';
vi.mock('server-only', () => ({}));
import { QUALITY_MULTIPLIERS } from '@/lib/domain';
import { generateImage } from '@/lib/ai/providers';

afterEach(() => vi.unstubAllGlobals());

it('defines exact multipliers: low=1, medium=3, high=9', () => {
  expect(QUALITY_MULTIPLIERS.low).toBe(1);
  expect(QUALITY_MULTIPLIERS.medium).toBe(3);
  expect(QUALITY_MULTIPLIERS.high).toBe(9);
});

it('calculates quota consumption as count * channels * multiplier', () => {
  const imageCount = 2;
  const channelsCount = 4;

  const lowCost = imageCount * channelsCount * QUALITY_MULTIPLIERS.low;
  expect(lowCost).toBe(8);

  const mediumCost = imageCount * channelsCount * QUALITY_MULTIPLIERS.medium;
  expect(mediumCost).toBe(24);

  const highCost = imageCount * channelsCount * QUALITY_MULTIPLIERS.high;
  expect(highCost).toBe(72);
});

it('transmits exact quality parameter to OpenAI generations and edits APIs', async () => {
  const fetcher = vi.fn().mockImplementation(
    () => new Response(JSON.stringify({ data: [{ b64_json: 'dGVzdA==' }] }), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetcher);

  // 1. Test images/generations with medium quality
  await generateImage(
    { provider: 'openai', purpose: 'image', model: 'gpt-image-2.5-flare' },
    'test-key',
    'Test prompt',
    '1:1',
    [],
    'medium',
  );

  expect(fetcher).toHaveBeenCalledTimes(1);
  const genBody = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(genBody.quality).toBe('medium');
  expect(genBody.model).toBe('gpt-image-2.5-flare');
  expect(genBody.size).toBe('1024x1024');

  // 2. Test images/edits with high quality
  fetcher.mockClear();
  await generateImage(
    { provider: 'openai', purpose: 'image', model: 'gpt-image-2.5-flare' },
    'test-key',
    'Test prompt with ref',
    '1:1',
    [{ mimeType: 'image/png', data: 'aW1hZ2U=' }],
    'high',
  );

  expect(fetcher).toHaveBeenCalledTimes(1);
  const editBody = fetcher.mock.calls[0][1].body as FormData;
  expect(editBody.get('quality')).toBe('high');
});
