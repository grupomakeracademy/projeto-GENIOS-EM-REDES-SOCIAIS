import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { z } from 'zod';
import { StructuredTextProvider, apiJSON, generateImage } from '@/lib/ai/providers';
afterEach(() => vi.unstubAllGlobals());
it('sends reference images through the image edit endpoint as multipart data', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: 'aW1hZ2U=' }] })));
  vi.stubGlobal('fetch', fetcher);
  await generateImage(
    { provider: 'openai', purpose: 'image', model: 'gpt-image-2.5-sunburst' },
    'test-key',
    'Brand scene',
    '1:1',
    [{ mimeType: 'image/png', data: 'aW1hZ2U=' }],
  );
  expect(fetcher.mock.calls[0][0]).toBe('https://api.openai.com/v1/images/edits');
  const request = fetcher.mock.calls[0][1];
  expect(request.body).toBeInstanceOf(FormData);
  expect(request.body.get('size')).toBe('1024x1024');
  expect(request.body.getAll('image[]')).toHaveLength(1);
  expect(request.headers).not.toHaveProperty('Content-Type');
});
it('validates OpenAI structured responses and usage', async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"caption":"Validated content"}' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
      { status: 200 },
    ),
  );
  vi.stubGlobal('fetch', fetcher);
  const result = await new StructuredTextProvider().generate(
    { provider: 'openai', purpose: 'text', model: 'test-model' },
    'test-key',
    z.object({ caption: z.string() }),
    { briefing: 'test' },
  );
  expect(result.data.caption).toBe('Validated content');
  expect(result.usage.input_tokens).toBe(10);
  const request = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(request.response_format.json_schema.strict).toBe(true);
  expect(request.messages[0].content).toContain('untrusted data');
});
it('rejects invalid provider output instead of inventing content', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: '{"wrong":1}' } }] })),
      ),
  );
  await expect(
    new StructuredTextProvider().generate(
      { provider: 'openai', purpose: 'text', model: 'test' },
      'test',
      z.object({ caption: z.string() }),
      {},
    ),
  ).rejects.toThrow('invalid_output');
});
it('distinguishes provider rate limits', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 429 })));
  await expect(
    apiJSON('https://api.openai.com/v1/chat/completions', 'test', {}, 'openai'),
  ).rejects.toThrow('rate_limit');
});
it('does not silently fall back to another provider', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 503 }));
  vi.stubGlobal('fetch', fetcher);
  await expect(
    new StructuredTextProvider().generate(
      { provider: 'anthropic', purpose: 'text', model: 'test' },
      'test',
      z.object({ caption: z.string() }),
      {},
    ),
  ).rejects.toThrow('provider_unavailable');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
