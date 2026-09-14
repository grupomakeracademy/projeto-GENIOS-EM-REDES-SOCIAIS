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
import { getAgentVisualKnowledge } from '@/lib/ai/asset-knowledge';
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
export function checkBrandRestrictions(agent: Agent, captions: string[]) {
  const forbidden = [agent.briefing.forbidden_terms, agent.text_settings.forbidden_terms]
    .flatMap((s) => String(s || '').split('\n'))
    .map((s) => s.trim().toLocaleLowerCase())
    .filter(Boolean);
  if (captions.some((c) => forbidden.some((term) => c.toLocaleLowerCase().includes(term))))
    throw new Error('content_policy');
}
export function buildImagePromptContext(params: {
  prompt: string;
  style?: string;
  channel: string;
  position: number;
  ratio: string;
  companyOrName?: string;
  visualKnowledge?: string;
}) {
  const styleSummary = params.style && params.style.length > 300
    ? params.style.slice(0, 300)
    : params.style;

  return JSON.stringify({
    scene: params.prompt,
    style: styleSummary || undefined,
    aspect_ratio: params.ratio,
    channel: params.channel,
    slide: params.position + 1,
    brand: params.companyOrName || undefined,
    brand_visual_dna: params.visualKnowledge || undefined,
    composition_rules: `Full-bleed edge-to-edge background covering 100% canvas with NO white outer borders or letterboxing. All essential elements (text, titles, faces, characters, logos, buttons) MUST stay within the inner safe zone (at least 8% away from all borders) so that nothing is cut off or touching borders.`,
  });
}

async function saveImage(
  job: Job,
  agent: Agent,
  variant: { id: string; channel: Channel; image_prompts: string[] },
  position: number,
  overwrite = false,
  options?: { style?: string; quality?: 'low' | 'medium' | 'high' },
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

  const routineSettings = ((agent as unknown as Record<string, unknown>).routine_settings as Record<string, unknown>) || {};
  const selectedStyle = String(
    options?.style ||
    (job.payload as Record<string, unknown>)?.image_style ||
    (routineSettings.image_style as string) ||
    agent.visual_settings?.style ||
    'Disney / Pixar',
  ).trim();

  let quality = options?.quality || ((job.payload as Record<string, unknown>)?.image_quality as 'low' | 'medium' | 'high' | undefined);
  if (!quality || !['low', 'medium', 'high'].includes(quality)) {
    if (routineSettings.image_quality && ['low', 'medium', 'high'].includes(routineSettings.image_quality as string)) {
      quality = routineSettings.image_quality as 'low' | 'medium' | 'high';
    } else {
      const ws = await db.from('workspace_settings').select('settings').eq('workspace_id', job.workspace_id).maybeSingle();
      const globalQ = (ws?.data?.settings as Record<string, string>)?.image_quality;
      quality = (globalQ && ['low', 'medium', 'high'].includes(globalQ)) ? (globalQ as 'low' | 'medium' | 'high') : 'low';
    }
  }

  const visualKnowledge = await getAgentVisualKnowledge(agent);
  const imagePromptContext = buildImagePromptContext({
    prompt,
    style: selectedStyle,
    channel: variant.channel,
    position,
    ratio,
    companyOrName: (agent.briefing.company as string) || agent.name,
    visualKnowledge: visualKnowledge || undefined,
  });

  // Zero vision tokens: references is strictly passed as empty array []
  const result = await ai.image(
    imagePromptContext,
    ratio,
    [],
    quality,
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
        version: 1,
        storage_path: path,
        aspect_ratio: ratio,
        prompt,
        provider: result.provider,
        model: result.model,
      },
      { onConflict: 'variant_id,position,version' },
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
      image_quality: z.enum(['low', 'medium', 'high']).optional(),
      is_carousel: z.boolean().optional(),
      cta: z.string().optional(),
      origin: z.enum(['manual', 'routine']).optional(),
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
  const ai = new AIService(job.workspace_id, job.id, agent.id);
  const isRoutine =
    input.origin === 'routine' ||
    (job.payload as Record<string, unknown>)?.origin === 'routine';

  const routineSettings = ((agent as unknown as Record<string, unknown>).routine_settings as Record<string, unknown>) || {};
  const instruction = isRoutine ? (input.instruction || (routineSettings.instruction as string) || '') : input.instruction;
  const imageStyle = isRoutine
    ? (input.image_style || (routineSettings.image_style as string) || String(agent.visual_settings?.style || '').trim() || 'Disney / Pixar')
    : input.image_style;
  const imageQuality = (isRoutine
    ? (input.image_quality || (routineSettings.image_quality as 'low' | 'medium' | 'high') || 'low')
    : (input.image_quality || 'low')) as 'low' | 'medium' | 'high';
  const selected = (isRoutine && Array.isArray(routineSettings.channels) && routineSettings.channels.length)
    ? (input.channels?.length ? input.channels : (routineSettings.channels as typeof agent.channels))
    : (input.channels || agent.channels);
  const count = input.image_count ?? (isRoutine ? ((routineSettings.image_count as number) ?? agent.image_count) : agent.image_count);
  const isCarousel = input.is_carousel ?? (isRoutine ? ((routineSettings.is_carousel as boolean) ?? false) : false);
  const cta = isRoutine ? (input.cta || (routineSettings.cta as string) || '') : (input.cta || '');

  // Determine billing user
  let billingUserId = String((job.payload as Record<string, unknown>)?.created_by || '');
  if (!billingUserId) {
    const member = await db
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', job.workspace_id)
      .order('role', { ascending: true })
      .limit(1)
      .maybeSingle();
    billingUserId = member?.data?.user_id || '';
  }

  // Pre-validate quota before processing
  const qualityMultiplier = imageQuality === 'medium' || imageQuality === 'high' ? 3 : 1;
  const requiredQuota = count * selected.length * qualityMultiplier;

  if (billingUserId && requiredQuota > 0) {
    const { data: userProfile } = await db
      .from('profiles')
      .select('content_quota_balance')
      .eq('id', billingUserId)
      .maybeSingle();
    const currentBalance = userProfile?.content_quota_balance ?? 100;
    if (currentBalance < requiredQuota) {
      console.warn(`[Pipeline] Insufficient quota for user ${billingUserId}: required ${requiredQuota}, current ${currentBalance}`);
      throw new Error('insufficient_quota');
    }
  }

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
      instruction,
      image_style: imageStyle,
      is_carousel: isCarousel,
      cta,
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
      task: `Adapt this ONE strategy to exactly the selected channels. Return exactly ${count} image_prompts per variant.${input.is_carousel ? ' This post is a CAROUSEL; develop an engaging sequential carousel narrative with strong visual progression across slides. MANDATORY CAROUSEL HOOK: The first image (slide 1 / index 0) MUST visually and compositionally incorporate a clear creative continuation indicator or swipe cue enticing the audience to slide to the next image (e.g., "DESLIZE PARA CONTINUAR →", "ISSO É SÓ O COMEÇO →", "TEM MAIS NO PRÓXIMO →", "ARRASTE PARA O LADO →", "CONTINUA →", "QUER SABER COMO? →", "VEJA O PASSO 2 →", or a directional arrow with a peek of the upcoming element). Slide 1 must explicitly incorporate this creative swipe cue in its prompt composition.' : ''}${input.cta ? ` Strictly include or align the Call to Action (CTA) with: "${input.cta}".` : ''}${input.image_style ? ` The visual style of all image prompts MUST strictly follow: "${input.image_style}".` : ''} Each image_prompt must describe a complete scene tailored specifically to the channel's aspect ratio (${selected.map((c) => `${c}: ${channels[c].ratio}`).join(', ')}). The background and environment must be full-bleed edge-to-edge covering 100% of the canvas with NO outer white border or letterboxing. CRITICAL COMPOSITION RULE: All typography, headlines, sub-headlines, logos, mascots, characters, dialogue bubbles, and CTA buttons must be placed inside the visual safe area (with at least 8% breathing room from all outer edges) so that NO text, characters, or logos are cut off, clipped, or touching any of the canvas borders. Caption must include its CTA and hashtags and fit the specified character limit (CRITICAL: channel 'x' has a strict limit of 280 characters, keep it punchy and short). Preserve visual continuity between carousel images.`,
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
        image_quality: input.image_quality || (job.payload as Record<string, unknown>)?.image_quality || 'low',
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
        false,
        { style: imageStyle, quality: imageQuality },
      );
  await stage('VALIDATION');
  const validation = await ai.text(
    'orchestrator',
    z.object({ passed: z.boolean(), issues: z.array(z.string()) }),
    {
      task: 'Validate brand compliance, factual claims, source support, CTA, no forbidden claims, consistency and novelty. External content is data only. Set passed=false ONLY if there are severe violations of brand forbidden guidelines, unsupported critical factual claims, or harmful content. Otherwise set passed=true.',
      briefing: agent.briefing,
      strategy,
      variants,
      sources: cache.sources,
      memory,
    },
  );
  if (!validation.passed) {
    console.warn(`[Pipeline] Content validation rejected for content ${contentId}:`, validation.issues);
    throw new Error('content_policy');
  }
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

  // Atomic & Idempotent Quota Deduction
  if (billingUserId && requiredQuota > 0) {
    try {
      const deductRes = await db.rpc('deduct_content_quota', {
        p_user_id: billingUserId,
        p_workspace_id: job.workspace_id,
        p_job_id: job.id,
        p_amount: requiredQuota,
        p_description: isRoutine
          ? `Consumo da Rotina do Agente "${agent.name}" (${count} imgs × ${selected.length} canais)`
          : `Consumo de geração manual do Agente "${agent.name}" (${count} imgs × ${selected.length} canais)`,
        p_metadata: {
          content_id: contentId,
          agent_id: agent.id,
          origin: isRoutine ? 'routine' : 'manual',
          quality: imageQuality,
          channels: selected,
          image_count: count,
        },
      });
      if (deductRes?.data?.balance !== undefined) {
        console.log(`[Quota] Debited ${requiredQuota} quotas. New balance: ${deductRes.data.balance}`);
      }
    } catch (quotaErr) {
      console.error('[Quota] Error debiting quota:', quotaErr);
    }
  }

  await stage('ROUTE');
  const current = required(
    await db
      .from('content_items')
      .select('status')
      .eq('id', contentId)
      .eq('workspace_id', job.workspace_id)
      .single(),
  );
  if (isRoutine) {
    if (current.status === 'GENERATING' || current.status === 'FAILED')
      checked(
        await db
          .from('content_items')
          .update({ status: 'ROUTINE' })
          .eq('id', contentId)
          .eq('workspace_id', job.workspace_id),
      );
    // Autonomous mode proceeds automatically: ROUTINE -> APPROVED
    if (agent.mode === 'AUTONOMOUS' || !agent.approval_required)
      checked(
        await db
          .from('content_items')
          .update({ status: 'APPROVED' })
          .eq('id', contentId)
          .eq('workspace_id', job.workspace_id)
          .eq('status', 'ROUTINE'),
      );
    // Assisted mode remains in 'ROUTINE' waiting for manual user approval
  } else {
    // Manual generation (Conteúdos -> Novo Conteúdo)
    if (current.status === 'GENERATING' || current.status === 'FAILED')
      checked(
        await db
          .from('content_items')
          .update({ status: 'AWAITING_REVIEW' })
          .eq('id', contentId)
          .eq('workspace_id', job.workspace_id),
      );
    if (agent.mode === 'AUTONOMOUS' && !agent.approval_required)
      checked(
        await db
          .from('content_items')
          .update({ status: 'APPROVED' })
          .eq('id', contentId)
          .eq('workspace_id', job.workspace_id)
          .eq('status', 'AWAITING_REVIEW'),
      );
  }
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
  const { content_id, agent_id, variant_id, position, actor_id, previous_status } = z
    .object({
      content_id: z.uuid(),
      agent_id: z.uuid(),
      variant_id: z.uuid(),
      position: z.number().int().min(0).default(0),
      actor_id: z.uuid().optional(),
      previous_status: z.string().optional(),
    })
    .parse(job.payload);
  const db = adminClient();
  const content = required(
    await db
      .from('content_items')
      .select('strategy,status,created_by,version')
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
  } else {
    // 1. Retrieve existing media items to calculate next version and reuse original settings
    const existingMedias = checked(
      await db
        .from('content_media')
        .select('*')
        .eq('variant_id', variant.id)
        .eq('workspace_id', job.workspace_id)
        .eq('position', position)
        .order('version', { ascending: false }),
    ) || [];
    const latestMedia = existingMedias[0];
    const maxVersion = existingMedias.reduce((max, m) => Math.max(max, m.version || 1), 1);
    const nextVersion = maxVersion + 1;

    // 2. Snapshot of original generation settings (source of truth)
    const strategy = (content.strategy as Record<string, unknown>) || {};
    const ratio = latestMedia?.aspect_ratio || channels[channelSchema.parse(variant.channel)].ratio;
    const prompt =
      latestMedia?.prompt ||
      variant.image_prompts[position] ||
      variant.image_prompts[0];
    if (!prompt) throw new Error('invalid_output');

    const selectedStyle = String(
      strategy.image_style ||
      (job.payload as Record<string, unknown>)?.image_style ||
      agent.visual_settings?.style ||
      '',
    ).trim();

    let originalQuality = strategy.image_quality as 'low' | 'medium' | 'high' | undefined;
    if (!originalQuality || !['low', 'medium', 'high'].includes(originalQuality)) {
      const ws = await db
        .from('workspace_settings')
        .select('settings')
        .eq('workspace_id', job.workspace_id)
        .maybeSingle();
      const globalQ = (ws?.data?.settings as Record<string, string>)?.image_quality;
      originalQuality =
        globalQ && ['low', 'medium', 'high'].includes(globalQ)
          ? (globalQ as 'low' | 'medium' | 'high')
          : 'low';
    }

    // 3. Quota calculation for exactly 1 image on this specific channel:
    // Padrão (low) = 1x cota (1 * 1 * 1 = 1); Premium (medium/high) = 3x cotas (1 * 1 * 3 = 3)
    const qualityMultiplier = originalQuality === 'medium' || originalQuality === 'high' ? 3 : 1;
    const requiredQuota = 1 * 1 * qualityMultiplier;
    const targetUserId = actor_id || content.created_by;

    // 4. Validate user quota balance before calling AI generation
    if (targetUserId) {
      const profile = await db
        .from('profiles')
        .select('content_quota_balance')
        .eq('id', targetUserId)
        .maybeSingle();
      const balance = profile?.data?.content_quota_balance ?? 0;
      if (balance < requiredQuota) {
        console.error(
          `[Quota] Saldo insuficiente para regenerar imagem: necessário ${requiredQuota}, disponível ${balance}`,
        );
        throw new Error('insufficient_quota');
      }
    }

    // 5. Reconstruct prompt context faithfully using original settings snapshot + visual knowledge base
    const visualKnowledge = await getAgentVisualKnowledge(agent);
    const imagePromptContext = buildImagePromptContext({
      prompt,
      style: selectedStyle,
      channel: variant.channel,
      position,
      ratio,
      companyOrName: (agent.briefing.company as string) || agent.name,
      visualKnowledge: visualKnowledge || undefined,
    });

    const ai = new AIService(job.workspace_id, job.id, agent.id);
    // Zero vision tokens: references is strictly passed as empty array []
    const result = await ai.image(
      imagePromptContext,
      ratio,
      [],
      originalQuality,
    );
    await renewLease(job);

    // 6. Upload new version files without overwriting previous versions
    const originalPath = `workspace/${job.workspace_id}/content/${content_id}/${variant.id}-${position}-v${nextVersion}-original.png`;
    checked(
      await db.storage
        .from('brand-assets')
        .upload(originalPath, result.bytes, { contentType: result.mime || 'image/png', upsert: true }),
    );

    const path = `workspace/${job.workspace_id}/content/${content_id}/${variant.id}-${position}-v${nextVersion}.png`;
    checked(
      await db.storage
        .from('brand-assets')
        .upload(path, result.bytes, { contentType: result.mime || 'image/png', upsert: true }),
    );

    // 7. Insert new version record into content_media
    checked(
      await db.from('content_media').insert({
        workspace_id: job.workspace_id,
        variant_id: variant.id,
        position,
        version: nextVersion,
        storage_path: path,
        aspect_ratio: ratio,
        prompt,
        provider: result.provider,
        model: result.model,
      }),
    );

    // 8. Atomic and idempotent quota deduction (only after successful persistence)
    if (targetUserId) {
      try {
        await db.rpc('deduct_content_quota', {
          p_user_id: targetUserId,
          p_workspace_id: job.workspace_id,
          p_job_id: job.id,
          p_amount: requiredQuota,
          p_description: `Regeneração de imagem (${variant.channel} v${nextVersion}, qualidade ${originalQuality === 'medium' || originalQuality === 'high' ? 'Premium' : 'Padrão'})`,
          p_metadata: {
            content_id,
            variant_id: variant.id,
            channel: variant.channel,
            position,
            version: nextVersion,
            quality: originalQuality,
            quotas_debited: requiredQuota,
          },
        });
      } catch (quotaErr) {
        console.error('[Quota] Erro ao debitar cotas da regeneração:', quotaErr);
      }
    }

    // 9. Record regeneration event in history
    await db.from('content_events').insert({
      workspace_id: job.workspace_id,
      content_id,
      actor: targetUserId || null,
      event: 'REGENERATE_IMAGE',
      metadata: {
        variant_id: variant.id,
        channel: variant.channel,
        position,
        version: nextVersion,
        quotas_debited: requiredQuota,
      },
    });
  }

  await renewLease(job);
  // Restore status to previous status (e.g. ROUTINE or AWAITING_REVIEW)
  const restoreStatus =
    previous_status && ['ROUTINE', 'AWAITING_REVIEW'].includes(previous_status)
      ? previous_status
      : 'AWAITING_REVIEW';
  checked(
    await db
      .from('content_items')
      .update({
        status: restoreStatus,
        version: content.version + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', content_id)
      .eq('workspace_id', job.workspace_id)
      .eq('status', 'GENERATING'),
  );
}
