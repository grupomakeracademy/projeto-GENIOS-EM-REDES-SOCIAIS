import 'server-only';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase/server';
import { serverCredential } from './credentials';
import { configSchema, type ProviderId, type AIConfig } from '@/lib/domain';
import { StructuredTextProvider, generateImage, embedding } from './providers';
import { openAIDefaults } from './defaults';
export async function credential(workspaceId: string, provider: ProviderId) {
  void workspaceId; // Credentials are exclusively server-wide environment values.
  const server = serverCredential(provider);
  if (server) return server;
  throw new Error('provider_missing');
}
export class AIService {
  constructor(
    private workspaceId: string,
    private jobId?: string,
  ) {}
  async config(purpose: AIConfig['purpose']) {
    const { data, error } = await adminClient()
      .from('ai_provider_configs')
      .select('purpose,provider,model,enabled')
      .eq('workspace_id', this.workspaceId)
      .eq('purpose', purpose)
      .maybeSingle();
    if (error) throw new Error('internal_error');
    if (data?.enabled === false) throw new Error('provider_missing');
    const config = data ?? openAIDefaults().find((c) => c.purpose === purpose);
    if (!config) throw new Error('provider_missing');
    return configSchema.parse(config);
  }
  async text<T>(purpose: 'text' | 'orchestrator', schema: z.ZodType<T>, context: unknown) {
    const config = await this.config(purpose);
    const result = await new StructuredTextProvider().generate(
      config,
      await credential(this.workspaceId, config.provider),
      schema,
      context,
    );
    await this.usage(config, purpose, result.usage);
    return result.data;
  }
  async vector(text: string) {
    const config = await this.config('embedding');
    const start = Date.now();
    const result = await embedding(
      config,
      await credential(this.workspaceId, config.provider),
      text,
    );
    await this.usage(config, 'embedding', { latency_ms: Date.now() - start });
    return result;
  }
  async image(prompt: string, ratio: string, references: { mimeType: string; data: string }[]) {
    const config = await this.config('image'),
      start = Date.now();
    const result = await generateImage(
      config,
      await credential(this.workspaceId, config.provider),
      prompt,
      ratio,
      references,
    );
    await this.usage(config, 'image', { latency_ms: Date.now() - start, images: 1 });
    return { ...result, provider: config.provider, model: config.model };
  }
  private async usage(
    config: AIConfig,
    operation: string,
    usage: {
      latency_ms: number;
      input_tokens?: number | null;
      output_tokens?: number | null;
      images?: number;
    },
  ) {
    const { error } = await adminClient()
      .from('usage_events')
      .insert({
        workspace_id: this.workspaceId,
        job_id: this.jobId ?? null,
        provider: config.provider,
        model: config.model,
        operation,
        ...usage,
      });
    if (error) throw new Error('internal_error');
  }
}
