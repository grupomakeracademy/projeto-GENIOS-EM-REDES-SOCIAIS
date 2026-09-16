import { z } from 'zod';
import { guard, checked, fail, AppError } from '@/lib/security/context';
import { adminClient } from '@/lib/supabase/server';
import { channels, channelSchema, type Channel } from '@/lib/domain';
import { requireAgent } from '@/lib/security/agent';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await guard(request),
      { id } = await params;
    z.uuid().parse(id);
    const item = checked(
      await ctx.db
        .from('content_items')
        .select('*,content_variants(*,content_media(*)),content_events(*)')
        .eq('id', id)
        .eq('workspace_id', ctx.workspaceId)
        .single(),
    );
    if (item && !(item.strategy as Record<string, unknown>)?.instruction) {
      const job = await ctx.db.from('background_jobs').select('payload').eq('id', id).maybeSingle();
      const payload = (job.data?.payload as Record<string, unknown>) || {};
      if (payload.instruction || payload.image_style || payload.cta || payload.is_carousel !== undefined) {
        item.strategy = {
          ...(item.strategy || {}),
          instruction: (item.strategy as Record<string, unknown>)?.instruction || payload.instruction || '',
          image_style: (item.strategy as Record<string, unknown>)?.image_style || payload.image_style || '',
          is_carousel: (item.strategy as Record<string, unknown>)?.is_carousel ?? payload.is_carousel ?? false,
          cta: (item.strategy as Record<string, unknown>)?.cta || payload.cta || '',
        };
      }
    }
    for (const variant of item.content_variants)
      for (const media of variant.content_media) {
        const signed = await ctx.db.storage
          .from('brand-assets')
          .createSignedUrl(mediaDisplaySource(media.storage_path), 900);
        media.url = signed.data?.signedUrl;
      }
    return Response.json(item);
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await guard(request, 'write'),
      { id } = await params;
    z.uuid().parse(id);
    const raw = await request.json();
    const { action, version } = z
      .object({
        action: z.enum([
          'approve',
          'reject',
          'archive',
          'schedule',
          'publish',
          'edit',
          'regenerate_copy',
          'regenerate_image',
        ]),
        version: z.number().int().min(1),
      })
      .parse(raw);
    const db = adminClient();
    const item = checked(
      await ctx.db
        .from('content_items')
        .select('*,content_variants(id,channel,caption)')
        .eq('id', id)
        .eq('workspace_id', ctx.workspaceId)
        .maybeSingle(),
    );
    if (!item) throw new AppError('forbidden', 403);
    if (item.version !== version) throw new AppError('conflict', 409);
    if (action.startsWith('regenerate_')) {
      if (item.strategy?.source === 'import') throw new AppError('A imagem importada é preservada sem regeneração.',409);
      if (!['ROUTINE', 'AWAITING_REVIEW', 'REJECTED', 'FAILED'].includes(item.status))
        throw new AppError('conflict', 409);
      const payload = z
        .object({
          variant_id: z.uuid(),
          position: z.number().int().min(0).max(19).optional(),
          idempotency_key: z.uuid(),
        })
        .parse(raw);
      if (!item.content_variants.some((v: { id: string }) => v.id === payload.variant_id))
        throw new AppError('forbidden', 403);

      // Validate quota balance before enqueuing regeneration
      if (action === 'regenerate_image') {
        const strategy = (item.strategy as Record<string, unknown>) || {};
        let originalQuality = strategy.image_quality as string | undefined;
        if (!originalQuality || !['low', 'medium', 'high'].includes(originalQuality)) {
          const ws = await db
            .from('workspace_settings')
            .select('settings')
            .eq('workspace_id', ctx.workspaceId)
            .maybeSingle();
          const globalQ = (ws?.data?.settings as Record<string, string>)?.image_quality;
          originalQuality = globalQ && ['low', 'medium', 'high'].includes(globalQ) ? globalQ : 'low';
        }
        const qualityMultiplier = originalQuality === 'medium' || originalQuality === 'high' ? 3 : 1;
        const requiredQuota = 1 * 1 * qualityMultiplier;

        const profile = await db
          .from('profiles')
          .select('content_quota_balance')
          .eq('id', ctx.user.id)
          .maybeSingle();
        const currentBalance = profile?.data?.content_quota_balance ?? 0;
        if (currentBalance < requiredQuota) {
          throw new AppError('insufficient_quota', 400);
        }
      }

      const queued = await db.rpc('enqueue_regeneration', {
        w: ctx.workspaceId,
        c: id,
        v: payload.variant_id,
        expected: version,
        operation: action,
        pos: payload.position ?? 0,
        k: `${ctx.workspaceId}:${payload.idempotency_key}`,
        actor_id: ctx.user.id,
      });
      if (queued.error) throw new AppError('conflict', 409);
      return Response.json({ ok: true }, { status: 202 });
    }
    const payload: Record<string, unknown> = {};
    if (action === 'edit') {
      const v = z
        .object({ variant_id: z.uuid(), caption: z.string().min(1).max(63206) })
        .parse(raw);
      const variant = item.content_variants.find((c: { id: string }) => c.id === v.variant_id);
      if (!variant || v.caption.length > channels[variant.channel as Channel].limit)
        throw new AppError('invalid_input');
      Object.assign(payload, v);
    }
    if (action === 'schedule') {
      const v = z
        .object({ scheduled_at: z.iso.datetime(), variant_id: z.uuid().optional() })
        .parse(raw);
      if (Date.parse(v.scheduled_at) <= Date.now()) throw new AppError('invalid_schedule');
      Object.assign(payload, v);
    }
    if (action === 'publish') {
      const v = z.object({ variant_id: z.uuid().optional() }).safeParse(raw);
      if (v.success && v.data.variant_id) {
        payload.variant_id = v.data.variant_id;
      }
    }
    if (action === 'reject')
      payload.reason = z
        .string()
        .max(2000)
        .parse(raw.reason || '');
    const result = await db.rpc('mutate_content', {
      w: ctx.workspaceId,
      c: id,
      expected: version,
      operation: action,
      payload,
      actor_id: ctx.user.id,
    });
    if (result.error)
      throw new AppError(
        result.error.message.includes('conflict') ? 'conflict' : 'invalid_input',
        409,
      );
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await guard(request, 'write'),
      { id } = await params;
    z.uuid().parse(id);

    const body = z
      .object({
        agent_id: z.string().uuid(),
        instruction: z.string().max(10000).default(''),
        image_style: z.string().max(120).optional(),
        image_quality: z.enum(['low', 'medium', 'high']).optional(),
        is_carousel: z.boolean().optional(),
        cta: z.string().max(500).optional(),
        channels: z.array(channelSchema).min(1),
        image_count: z.number().int().min(1).max(6).default(2),
        status: z.enum(['DRAFT']).default('DRAFT'),
      })
      .parse(await request.json());

    if (body.image_count <= 1) {
      body.is_carousel = false;
    }

    await requireAgent(ctx, body.agent_id);

    const db = adminClient();
    const existing = checked(
      await ctx.db
        .from('content_items')
        .select('id, status, created_by, workspace_id')
        .eq('id', id)
        .eq('workspace_id', ctx.workspaceId)
        .maybeSingle(),
    );
    if (!existing) throw new AppError('forbidden', 403);
    if (existing.status !== 'DRAFT') {
      throw new AppError('Apenas conteúdos com status Rascunho podem ser revisados desta forma.', 400);
    }

    const topic = body.instruction.trim() || 'Novo rascunho de conteúdo';
    const strategy = {
      image_style: body.image_style || 'Disney / Pixar',
      image_quality: body.image_quality || 'low',
      is_carousel: body.image_count >= 2 ? (body.is_carousel ?? false) : false,
      cta: body.cta || '',
      channels: body.channels,
      image_count: body.image_count,
      instruction: body.instruction.trim(),
    };

    const { error: updateErr } = await db
      .from('content_items')
      .update({
        agent_id: body.agent_id,
        topic,
        strategy,
        status: 'DRAFT',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId);

    if (updateErr) throw new AppError(updateErr.message, 500);

    // Delete removed channels for this draft
    await db
      .from('content_variants')
      .delete()
      .eq('content_id', id)
      .eq('workspace_id', ctx.workspaceId)
      .not('channel', 'in', `(${body.channels.join(',')})`);

    // Upsert variants for selected channels
    for (const ch of body.channels) {
      await db.from('content_variants').upsert(
        {
          workspace_id: ctx.workspaceId,
          content_id: id,
          channel: ch,
          title: topic.slice(0, 120),
          caption: '',
          cta: body.cta || '',
          aspect_ratio: channels[ch]?.ratio || '4:5',
          image_prompts: [],
        },
        { onConflict: 'content_id,channel' },
      );
    }

    await db.from('content_events').insert({
      workspace_id: ctx.workspaceId,
      content_id: id,
      actor: ctx.user.id,
      event: 'DRAFT_UPDATED',
      metadata: { status: 'DRAFT', channels: body.channels },
    });

    return Response.json({ id, status: 'DRAFT' });
  } catch (e) {
    return fail(e);
  }
}
import { mediaDisplaySource } from '@/lib/media-display-source';
