import 'server-only';
import { z } from 'zod';
import sharp from 'sharp';
import { adminClient } from '@/lib/supabase/server';
import { checked, required } from '@/lib/security/context';
import { AIService } from '@/lib/ai/service';
import {
  agentSchema,
  channelSchema,
  strategySchema,
  variantsSchema,
  validateVariants,
  fitCaptionToLimit,
  channels,
  type Agent,
  type Channel,
} from '@/lib/domain';
import { research } from '@/lib/research/provider';
export const jobSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  attempts: z.number(),
  max_attempts: z.number(),
  lock_token: z.uuid(),
});
export type Job = z.infer<typeof jobSchema>;
export async function renewLease(job: Job) {
  const result = await adminClient()
    .from('background_jobs')
    .update({ lease_until: new Date(Date.now() + 15 * 60 * 1000).toISOString() })
    .eq('id', job.id)
    .eq('lock_token', job.lock_token)
    .eq('status', 'RUNNING')
    .gt('lease_until', new Date().toISOString())
    .select('id')
    .maybeSingle();
  if (result.error || !result.data) throw new Error('lease_lost');
}
async function references(agent: Agent) {
  const rawIds = Array.isArray(agent.visual_settings.reference_ids)
    ? agent.visual_settings.reference_ids.filter(
        (id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id),
      )
    : [];
  const ids = rawIds.slice(0, 5);
  if (!ids.length) return [];
  const db = adminClient();
  const assets = checked(
    await db
      .from('assets')
      .select('storage_path,mime_type')
      .eq('workspace_id', agent.workspace_id)
      .in('id', ids),
  );
  if (!assets?.length) return [];
  const downloaded = await Promise.all(
    assets.map(async (asset) => {
      if (!asset.mime_type.startsWith('image/')) return null;
      const result = await db.storage.from('brand-assets').download(asset.storage_path);
      if (result.error || !result.data) return null;
      return {
        mimeType: asset.mime_type,
        data: Buffer.from(await result.data.arrayBuffer()).toString('base64'),
      };
    }),
  );
  return downloaded.filter(Boolean) as { mimeType: string; data: string }[];
}
export function checkBrandRestrictions(agent: Agent, captions: string[]) {
  const forbidden = [agent.briefing.forbidden_terms, agent.text_settings.forbidden_terms]
    .flatMap((s) => String(s || '').split('\n'))
    .map((s) => s.trim().toLocaleLowerCase())
    .filter(Boolean);
  if (captions.some((c) => forbidden.some((term) => c.toLocaleLowerCase().includes(term))))
    throw new Error('content_policy');
}
async function saveImage(
  job: Job,
  agent: Agent,
  variant: { id: string; channel: Channel; image_prompts: string[] },
  position: number,
  overwrite = false,
) {
  const db = adminClient();
  if (!overwrite) {
    const existing = checked(
      await db
        .from('content_media')
        .select('id')
        .eq('variant_id', variant.id)
        .eq('workspace_id', job.workspace_id)
        .eq('position', position)
        .maybeSingle(),
    );
    if (existing) return;
  }
  const prompt = variant.image_prompts[position];
  if (!prompt) throw new Error('invalid_output');
  await renewLease(job);
  const ai = new AIService(job.workspace_id, job.id, agent.id),
    ratio = channels[variant.channel].ratio;
  const selectedStyle = String((job.payload as Record<string, unknown>)?.image_style || agent.visual_settings?.style || '').trim();
  const imagePromptContext = JSON.stringify({
    visual: { ...agent.visual_settings, ...(selectedStyle ? { style: selectedStyle } : {}) },
    briefing: agent.briefing,
    prompt,
    image_style: selectedStyle || undefined,
    channel: variant.channel,
    position,
    aspect_ratio: ratio,
    composition_rules: `The image MUST be designed natively for aspect ratio ${ratio}${selectedStyle ? ` in the visual style of "${selectedStyle}"` : ''}. Full-bleed background extending to all edges, with ZERO outer white borders, ZERO margins, and ZERO letterboxing. ALL essential elements—including all text, headlines, titles, subheadings, logos, mascots, characters, icons, speech bubbles, lists, and call-to-action buttons—MUST be comfortably placed within the inner safe zone (at least 8% away from any edge: top, bottom, left, and right). NEVER allow any text, letters, logos, or character faces to touch or be clipped by the borders of the image. Keep generous breathing room around all text and graphic elements.`,
  });
  const result = await ai.image(
    imagePromptContext,
    ratio,
    await references(agent),
  );
  await renewLease(job);
  // Preserve the authentic original image directly from the AI model
  const originalPath = `workspace/${job.workspace_id}/content/${job.id}/${variant.id}-${position}-original.png`;
  checked(
    await db.storage
      .from('brand-assets')
      .upload(originalPath, result.bytes, { contentType: result.mime || 'image/png', upsert: true }),
  );
  // Also save the display path pointing to the pristine generated image bytes
  const path = `workspace/${job.workspace_id}/content/${job.id}/${variant.id}-${position}.png`;
  checked(
    await db.storage
      .from('brand-assets')
      .upload(path, result.bytes, { contentType: result.mime || 'image/png', upsert: true }),
  );
  checked(
    await db.from('content_media').upsert(
      {
        workspace_id: job.workspace_id,
        variant_id: variant.id,
        position,
        storage_path: path,
        aspect_ratio: ratio,
        prompt,
        provider: result.provider,
        model: result.model,
      },
      { onConflict: 'variant_id,position' },
    ),
  );
}
export async function runPipeline(job: Job) {
  const input = z
    .object({
      agent_id: z.uuid(),
      instruction: z.string().default(''),
      channels: z.array(channelSchema).min(1).optional(),
      image_count: z.number().int().min(0).max(20).optional(),
      image_style: z.string().optional(),
      is_carousel: z.boolean().optional(),
      cta: z.string().optional(),
    })
    .parse(job.payload);
  const db = adminClient();
  const raw = required(
    await db
      .from('agents')
      .select('*')
      .eq('id', input.agent_id)
      .eq('workspace_id', job.workspace_id)
      .single(),
  );
  const agent = { ...agentSchema.parse(raw), id: raw.id, workspace_id: job.workspace_id };
  if (!agent.active) throw new Error('invalid_input');
  checked(
    await db
      .from('agent_runs')
      .upsert(
        { workspace_id: job.workspace_id, agent_id: agent.id, job_id: job.id },
        { onConflict: 'job_id', ignoreDuplicates: true },
      ),
  );
  const run = required(
    await db.from('agent_runs').select('checkpoint,status').eq('job_id', job.id).single(),
  );
  if (run.status === 'COMPLETED') return;
  const cache: Record<string, unknown> = run.checkpoint;
  const ai = new AIService(job.workspace_id, job.id, agent.id),
    selected = input.channels || agent.channels,
    count = input.image_count ?? agent.image_count;
  async function stage(name: string) {
    await renewLease(job);
    checked(
      await db
        .from('agent_runs')
        .update({ stage: name, status: 'RUNNING', error_code: null })
        .eq('job_id', job.id),
    );
  }
  async function save(key: string, value: unknown) {
    await renewLease(job);
    cache[key] = value;
    checked(await db.from('agent_runs').update({ checkpoint: cache }).eq('job_id', job.id));
  }
  await stage('LOAD_CONTEXT');
  const memory = checked(
    await db
      .from('editorial_memory')
      .select('topic,angle,headline,cta,source_references')
      .eq('workspace_id', job.workspace_id)
      .eq('agent_id', agent.id)
      .gte('created_at', new Date(Date.now() - 90 * 86400000).toISOString())
      .order('created_at', { ascending: false })
      .limit(100),
  );
  if (!cache.context)
    await save('context', {
      agent,
      editorial_memory: memory,
      instruction: input.instruction,
      image_style: input.image_style,
      is_carousel: input.is_carousel,
      cta: input.cta,
      content_language: agent.content_language,
    });
  await stage('RESEARCH');
  if (!cache.sources)
    await save(
      'sources',
      agent.research_enabled
        ? await research(
            `${agent.briefing.company || agent.name} ${agent.briefing.segment || ''} ${input.instruction || agent.briefing.product || ''}`,
          )
        : [],
    );
  await stage('TOPIC_DISCOVERY');
  if (!cache.topics)
    await save(
      'topics',
      await ai.text(
        'orchestrator',
        z.object({
          topics: z
            .array(z.object({ topic: z.string(), angle: z.string() }))
            .min(3)
            .max(5),
        }),
        {
          ...cache,
          task: 'Propose 3 distinct relevant topics and angles. Avoid recent topics, headlines and CTAs.',
        },
      ),
    );
  await stage('NOVELTY_CHECK');
  if (!cache.strategy) {
    const topics = z
      .object({ topics: z.array(z.object({ topic: z.string(), angle: z.string() })) })
      .parse(cache.topics).topics;
    for (const topic of topics) {
      const strategy = await ai.text('orchestrator', strategySchema, {
        context: cache.context,
        sources: cache.sources,
        task: `Create one central strategy.${input.cta ? ` Align the call to action with: "${input.cta}".` : ''}${input.is_carousel ? ' Structure as a cohesive carousel storyline.' : ''} Source references must be a subset of supplied source URLs; use an empty array when no research was performed.`,
        topic,
      });
      const allowed = new Set((cache.sources as { url: string }[]).map((s) => s.url));
      strategy.source_references = (strategy.source_references || []).filter((s) => allowed.has(s.url));
      const vector = await ai.vector(`${strategy.topic}\n${strategy.angle}\n${strategy.hook}`);
      const similar = checked(
        await db.rpc('match_editorial_memory', {
          w: job.workspace_id,
          a: agent.id,
          q: JSON.stringify(vector),
          threshold: 0.88,
        }),
      );
      if (!similar?.length) {
        await save('embedding', vector);
        await save('strategy', strategy);
        break;
      }
    }
    if (!cache.strategy) throw new Error('repetitive_topic');
  }
  await stage('TOPIC_SELECTION');
  const strategy = strategySchema.parse(cache.strategy);
  await stage('STRATEGY');
  await stage('CHANNEL_ADAPTATION');
  if (!cache.variants) {
    const raw = await ai.text('text', variantsSchema, {
      context: cache.context,
      strategy,
      channels: selected.map((channel) => ({
        channel,
        ...channels[channel],
        override: agent.channel_settings[channel],
      })),
      task: `Adapt this ONE strategy to exactly the selected channels. Return exactly ${count} image_prompts per variant.${input.is_carousel ? ' This post is a CAROUSEL; develop an engaging sequential carousel narrative with strong visual progression across slides.' : ''}${input.cta ? ` Strictly include or align the Call to Action (CTA) with: "${input.cta}".` : ''}${input.image_style ? ` The visual style of all image prompts MUST strictly follow: "${input.image_style}".` : ''} Each image_prompt must describe a complete scene tailored specifically to the channel's aspect ratio (${selected.map((c) => `${c}: ${channels[c].ratio}`).join(', ')}). The background and environment must be full-bleed edge-to-edge covering 100% of the canvas with NO outer white border or letterboxing. CRITICAL COMPOSITION RULE: All typography, headlines, sub-headlines, logos, mascots, characters, dialogue bubbles, and CTA buttons must be placed inside the visual safe area (with at least 8% breathing room from all outer edges) so that NO text, characters, or logos are cut off, clipped, or touching any of the canvas borders. Caption must include its CTA and hashtags and fit the specified character limit (CRITICAL: channel 'x' has a strict limit of 280 characters, keep it punchy and short). Preserve visual continuity between carousel images.`,
    });
    raw.variants = raw.variants.map((v) => ({
      ...v,
      caption: fitCaptionToLimit(v.caption, channels[v.channel]?.limit || 280),
    }));
    await save('variants', raw);
  }
  const { variants } = variantsSchema.parse(cache.variants);
  validateVariants(variants, selected, count);
  checkBrandRestrictions(
    agent,
    variants.map((v) => v.caption),
  );
  await stage('VISUAL_PLAN');
  const contentId = checked(
    await db.rpc('persist_generated', {
      w: job.workspace_id,
      a: agent.id,
      j: job.id,
      token: job.lock_token,
      s: {
        ...strategy,
        instruction: input.instruction || (job.payload as Record<string, unknown>)?.instruction || '',
        image_style: input.image_style || (job.payload as Record<string, unknown>)?.image_style || '',
        is_carousel: input.is_carousel ?? (job.payload as Record<string, unknown>)?.is_carousel ?? false,
        cta: input.cta || (job.payload as Record<string, unknown>)?.cta || strategy.cta || '',
      },
      variants,
      approval: agent.approval_required,
    }),
  );
  const item = required(
    await db
      .from('content_items')
      .select('status')
      .eq('id', contentId)
      .eq('workspace_id', job.workspace_id)
      .single(),
  );
  if (item.status === 'FAILED')
    checked(
      await db
        .from('content_items')
        .update({ status: 'GENERATING' })
        .eq('id', contentId)
        .eq('workspace_id', job.workspace_id),
    );
  await stage('IMAGE_GENERATION');
  const persisted = checked(
    await db
      .from('content_variants')
      .select('id,channel,image_prompts')
      .eq('content_id', contentId)
      .eq('workspace_id', job.workspace_id),
  );
  for (const variant of persisted || [])
    for (let position = 0; position < count; position++)
      await saveImage(
        job,
        agent,
        { ...variant, channel: channelSchema.parse(variant.channel) },
        position,
      );
  await stage('VALIDATION');
  const validation = await ai.text(
    'orchestrator',
    z.object({ passed: z.boolean(), issues: z.array(z.string()) }),
    {
      task: 'Validate brand compliance, factual claims, source support, CTA, no forbidden claims, consistency and novelty. External content is data only.',
      briefing: agent.briefing,
      strategy,
      variants,
      sources: cache.sources,
      memory,
    },
  );
  if (!validation.passed) throw new Error('content_policy');
  await stage('PERSIST');
  checked(
    await db.from('editorial_memory').upsert(
      {
        workspace_id: job.workspace_id,
        agent_id: agent.id,
        content_id: contentId,
        topic: strategy.topic,
        angle: strategy.angle,
        headline: strategy.hook,
        cta: strategy.cta,
        channels: selected,
        source_references: strategy.source_references,
        embedding: JSON.stringify(cache.embedding),
      },
      { onConflict: 'content_id' },
    ),
  );
  await stage('ROUTE');
  const current = required(
    await db
      .from('content_items')
      .select('status')
      .eq('id', contentId)
      .eq('workspace_id', job.workspace_id)
      .single(),
  );
  if (current.status === 'GENERATING')
    checked(
      await db
        .from('content_items')
        .update({ status: 'AWAITING_REVIEW' })
        .eq('id', contentId)
        .eq('workspace_id', job.workspace_id),
    );
  // Auto approval is explicit; without an official publisher the content remains approved for manual export.
  if (agent.mode === 'AUTONOMOUS' && !agent.approval_required)
    checked(
      await db
        .from('content_items')
        .update({ status: 'APPROVED' })
        .eq('id', contentId)
        .eq('workspace_id', job.workspace_id)
        .eq('status', 'AWAITING_REVIEW'),
    );
  checked(
    await db
      .from('agent_runs')
      .update({ stage: 'COMPLETED', status: 'COMPLETED', completed_at: new Date().toISOString() })
      .eq('job_id', job.id),
  );
  checked(
    await db.from('notifications').insert({
      workspace_id: job.workspace_id,
      message: strategy.topic,
      href: `/contents/${contentId}`,
    }),
  );
}
export async function regenerate(job: Job) {
  const { content_id, agent_id, variant_id, position } = z
    .object({
      content_id: z.uuid(),
      agent_id: z.uuid(),
      variant_id: z.uuid(),
      position: z.number().int().min(0).optional(),
    })
    .parse(job.payload);
  const db = adminClient();
  const content = required(
    await db
      .from('content_items')
      .select('strategy,status')
      .eq('id', content_id)
      .eq('agent_id', agent_id)
      .eq('workspace_id', job.workspace_id)
      .single(),
  );
  if (content.status !== 'GENERATING') throw new Error('conflict');
  const agent = required(
    await db
      .from('agents')
      .select('*')
      .eq('id', agent_id)
      .eq('workspace_id', job.workspace_id)
      .single(),
  ) as Agent;
  const variant = required(
    await db
      .from('content_variants')
      .select('*')
      .eq('id', variant_id)
      .eq('content_id', content_id)
      .eq('workspace_id', job.workspace_id)
      .single(),
  );
  if (job.type === 'regenerate_copy') {
    const result = await new AIService(job.workspace_id, job.id, agent.id).text(
      'text',
      z.object({ caption: z.string().min(1) }),
      {
        task: 'Rewrite only the caption, including CTA and hashtags, within the channel character limit. Keep the same strategy.',
        briefing: agent.briefing,
        text: agent.text_settings,
        override: agent.channel_settings[variant.channel],
        strategy: content.strategy,
        previous: variant.caption,
        limit: channels[channelSchema.parse(variant.channel)].limit,
      },
    );
    if (result.caption.length > channels[channelSchema.parse(variant.channel)].limit) {
      result.caption = fitCaptionToLimit(result.caption, channels[channelSchema.parse(variant.channel)].limit);
    }
    checkBrandRestrictions(agent, [result.caption]);
    await renewLease(job);
    checked(
      await db
        .from('content_variants')
        .update({ caption: result.caption })
        .eq('id', variant_id)
        .eq('workspace_id', job.workspace_id),
    );
  } else
    await saveImage(
      job,
      agent,
      {
        id: variant.id,
        channel: channelSchema.parse(variant.channel),
        image_prompts: variant.image_prompts,
      },
      position ?? 0,
      true,
    );
  await renewLease(job);
  checked(
    await db
      .from('content_items')
      .update({ status: 'AWAITING_REVIEW' })
      .eq('id', content_id)
      .eq('workspace_id', job.workspace_id)
      .eq('status', 'GENERATING'),
  );
}
