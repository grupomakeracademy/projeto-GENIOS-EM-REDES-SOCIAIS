// Server-only verification. Read-only by default; generation requires --generate.
// Never writes workspace configuration or logs credentials/content.
import { z } from 'zod';
import { openAIDefaults } from '../src/lib/ai/defaults';
import { serverCredential } from '../src/lib/ai/credentials';
import { apiJSON, embedding } from '../src/lib/ai/providers';

async function main() {
  const key = serverCredential('openai');
  if (!key) throw new Error('provider_missing');
  const models = z
    .object({ data: z.array(z.object({ id: z.string() })) })
    .parse(await apiJSON('https://api.openai.com/v1/models', key, undefined, 'openai', 'GET'));
  const configs = openAIDefaults();
  for (const config of configs) {
    const available = models.data.some((m) => m.id === config.model);
    console.log(JSON.stringify({ purpose: config.purpose, model: config.model, available }));
    if (!available) throw new Error('model_unavailable');
  }
  if (!process.argv.includes('--generate')) return;
  // At most four requests, no retries, two text outputs capped at 128 tokens,
  // one small embedding and one low-quality 1024px test image.
  for (const config of configs) {
    if (config.purpose === 'embedding') {
      const result = await embedding(config, key, 'Teste de memória semântica.');
      if (result.length !== 1536) throw new Error('invalid_output');
    } else if (config.purpose === 'image') {
      z.object({ data: z.array(z.object({ b64_json: z.string().min(100) })).min(1) }).parse(
        await apiJSON(
          'https://api.openai.com/v1/images/generations',
          key,
          {
            model: config.model,
            prompt: 'A simple blue circle on white. No text.',
            n: 1,
            quality: 'low',
            size: '1024x1024',
          },
          'openai',
        ),
      );
    } else {
      z.object({
        choices: z.array(z.object({ message: z.object({ content: z.string().min(1) }) })).min(1),
      }).parse(
        await apiJSON(
          'https://api.openai.com/v1/chat/completions',
          key,
          {
            model: config.model,
            messages: [{ role: 'user', content: 'Responda apenas: Olá.' }],
            max_completion_tokens: 128,
          },
          'openai',
        ),
      );
    }
    console.log(JSON.stringify({ purpose: config.purpose, generationVerified: true }));
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error &&
      [
        'provider_missing',
        'model_unavailable',
        'rate_limit',
        'timeout',
        'authentication_error',
        'provider_unavailable',
        'invalid_output',
      ].includes(error.message)
      ? error.message
      : 'verification_failed',
  );
  process.exitCode = 1;
});
