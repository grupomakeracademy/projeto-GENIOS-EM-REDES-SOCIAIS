import { z } from 'zod';
import { configSchema, providerSchema } from '@/lib/domain';
import { guard, checked, fail, AppError } from '@/lib/security/context';
import { credential } from '@/lib/ai/service';
import { apiJSON } from '@/lib/ai/providers';
import { openAIModels } from '@/lib/ai/defaults';
export async function GET(request: Request) {
  try {
    const ctx = await guard(request);
    const provider = providerSchema.parse(new URL(request.url).searchParams.get('provider'));
    const items =
      checked(
        await ctx.db
          .from('ai_model_registry')
          .select('provider,model_id,display_name,capabilities')
          .eq('workspace_id', ctx.workspaceId)
          .eq('provider', provider)
          .eq('enabled', true)
          .eq('deprecated', false)
          .order('display_name'),
      ) ?? [];
    for (const config of openAIModels().filter((c) => c.provider === provider)) {
      const item = items.find((i) => i.model_id === config.model);
      if (!item)
        items.push({
          provider,
          model_id: config.model,
          display_name: config.model,
          capabilities: [config.purpose],
        });
      else if (!item.capabilities.includes(config.purpose)) item.capabilities.push(config.purpose);
    }
    return Response.json({ items });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: Request) {
  try {
    const ctx = await guard(request, 'admin');
    const input = configSchema
      .safeExtend({ display_name: z.string().trim().min(1).max(160) })
      .parse(await request.json());
    if (input.purpose === 'embedding' && input.provider !== 'openai')
      throw new AppError('unsupported_capability');
    const path =
      input.provider === 'openai'
        ? `https://api.openai.com/v1/models/${encodeURIComponent(input.model)}`
        : input.provider === 'anthropic'
          ? `https://api.anthropic.com/v1/models/${encodeURIComponent(input.model)}`
          : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}`;
    await apiJSON(
      path,
      await credential(ctx.workspaceId, input.provider),
      undefined,
      input.provider,
      'GET',
    );
    const existing = checked(
      await ctx.db
        .from('ai_model_registry')
        .select('capabilities')
        .eq('workspace_id', ctx.workspaceId)
        .eq('provider', input.provider)
        .eq('model_id', input.model)
        .maybeSingle(),
    );
    const capabilities = [...new Set([...(existing?.capabilities || []), input.purpose])];
    checked(
      await ctx.db.from('ai_model_registry').upsert({
        workspace_id: ctx.workspaceId,
        provider: input.provider,
        model_id: input.model,
        display_name: input.display_name,
        capabilities,
        metadata: {
          verified_at: new Date().toISOString(),
          capability_source: 'administrator_configuration',
        },
        updated_at: new Date().toISOString(),
      }),
    );
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
