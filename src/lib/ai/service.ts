import 'server-only';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase/server';
import { serverCredential } from './credentials';
import { configSchema, type ProviderId, type AIConfig } from '@/lib/domain';
import { StructuredTextProvider, generateImage, embedding } from './providers';
import { openAIDefaults } from './defaults';
import { usableOverride, type AgentAIRecord } from './agent-config';
import { validateAgentModel } from './validate-model';
import { AppError } from '@/lib/security/context';
import { withAICallContext, type AICallContext } from './audit';
import { enforceModelPolicy } from './model-policy';
export async function credential(workspaceId: string, provider: ProviderId) {
  void workspaceId; // Credentials are exclusively server-wide environment values.
  const server = serverCredential(provider);
  if (server) return server;
  throw new Error('provider_missing');
}
export class AIService {
  private overrides = new Map<AIConfig['purpose'], Promise<ReturnType<typeof usableOverride>>>();
  constructor(
    private workspaceId: string,
    private jobId?: string,
    private agentId?: string,
    private audit: Partial<AICallContext> = {},
  ) {}
  private async override(purpose: AIConfig['purpose']) {
    if (!this.agentId) return null;
    const existing = this.overrides.get(purpose);
    if (existing) return existing;
    const resolution = this.resolveOverride(purpose);
    this.overrides.set(purpose, resolution);
    return resolution;
  }
  private async resolveOverride(purpose: AIConfig['purpose']) {
    const { data, error } = await adminClient()
      .from('agent_ai_configs')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .eq('agent_id', this.agentId!)
      .eq('purpose', purpose)
      .maybeSingle();
    if (error) throw new Error('internal_error');
    const result = usableOverride(data as AgentAIRecord | null, this.workspaceId, this.agentId!);
    if (!result) return null;
    try {
      await validateAgentModel(result.config, result.key);
      return result;
    } catch (error) {
      if (error instanceof AppError && error.status === 400) return null;
      if (error instanceof AppError && error.status === 429) throw new Error('rate_limit');
      throw new Error('provider_unavailable');
    }
  }
  async key(config: AIConfig) {
    const custom = await this.override(config.purpose);
    if (
      custom &&
      custom.config.provider === config.provider &&
      custom.config.model === config.model
    )
      return custom.key;
    return credential(this.workspaceId, config.provider);
  }
  async config(purpose: AIConfig['purpose']) {
    const custom = await this.override(purpose);
    if (custom) return enforceModelPolicy(custom.config);
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
    return enforceModelPolicy(configSchema.parse(config));
  }
  async text<T>(purpose: 'text' | 'orchestrator', schema: z.ZodType<T>, context: unknown) {
    const config = await this.config(purpose);
    const result = await withAICallContext(this.audit,async()=>new StructuredTextProvider().generate(
      config,
      await this.key(config),
      schema,
      context,
    ));
    await this.usage(config, purpose, result.usage);
    return result.data;
  }
  async vector(text: string) {
    const config = await this.config('embedding');
    const start = Date.now();
    const key = await this.key(config);
    const result = await withAICallContext(this.audit,()=>embedding(config, key, text));
    await this.usage(config, 'embedding', { latency_ms: Date.now() - start });
    return result;
  }
  async image(
    prompt: string,
    ratio: string,
    references: { mimeType: string; data: string }[],
    quality: 'low' | 'medium' | 'high' = 'low',
  ) {
    const config = await this.config('image'),
      start = Date.now();
    const key = await this.key(config);
    const result = await withAICallContext(this.audit,()=>generateImage(config, key, prompt, ratio, references, quality));
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
    // IMPORTANT: usage logging must NEVER terminate a successful pipeline.
    // A failure here means we lose audit data, not that the AI call failed.
    // The AI already responded and consumed tokens — aborting now would force
    // a retry that repeats expensive AI calls for no reason.
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
    if (error)
      console.warn('[Usage] Failed to persist usage_event (non-fatal):', {
        job_id: this.jobId,
        provider: config.provider,
        model: config.model,
        operation,
        error: error.message,
      });
  }
}
