import { z } from 'zod';
import { guard, checked, fail, AppError } from '@/lib/security/context';
import { adminClient } from '@/lib/supabase/server';
import { channelSchema, destinationSchema, publicationTypeSchema, publicationSelectionValid, MAX_CONTENT_INSTRUCTION_LENGTH, contentGenerationQuota } from '@/lib/domain';
import { executionResponsibles } from '@/features/content/responsibles';
import { requireAgent } from '@/lib/security/agent';
import { dispatchRequestedJob } from '@/lib/jobs/lifecycle';
import { requireSelectedReference } from '@/lib/ai/selected-reference';
export const maxDuration = 300;
export async function GET(request: Request) {
  try {
    const ctx = await guard(request);
    checked(await adminClient().rpc('expire_generation_jobs'));
    const agentId=await requireAgent(ctx,new URL(request.url).searchParams.get('agent'));
    const jobs = checked(
      await ctx.db
        .from('background_jobs')
        .select('id,status,payload,last_error,scheduled_at,agent_runs(stage,content_id)')
        .eq('workspace_id', ctx.workspaceId)
        .filter(agentId?'payload->>agent_id':'workspace_id','eq',agentId||ctx.workspaceId)
        .eq('type', 'agent_run')
        .is('payload->>deleted', null)
        .in('status', ['PENDING', 'RUNNING', 'FAILED'])
        .order('scheduled_at', { ascending: false })
        .limit(100),
    );
    const people = await executionResponsibles(
      ctx.workspaceId,
      (jobs || []).map((j) => String(j.payload.created_by || '')),
    );
    return Response.json(
      {
        items: (jobs || []).map((job) => ({
          id: job.id,
          status: job.status,
          responsibles: people.has(job.payload.created_by)
            ? [people.get(job.payload.created_by)]
            : [],
          scheduledAt: job.scheduled_at,
          agentId: job.payload.agent_id,
          instruction: String(job.payload.instruction || '').slice(0, 240),
          channels: job.payload.channels || [],
          error: job.last_error,
          stage:
            (Array.isArray(job.agent_runs) ? job.agent_runs[0] : job.agent_runs)?.stage ||
            'LOAD_CONTEXT',
          contentId:
            (Array.isArray(job.agent_runs) ? job.agent_runs[0] : job.agent_runs)?.content_id ||
            null,
        })),
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await guard(request, 'write');
    const { id } = z.object({ id: z.uuid() }).parse(await request.json());
    const result = await adminClient().rpc('retry_requested_job', { j: id, w: ctx.workspaceId, actor_id: ctx.user.id });
    if (result.error || !result.data) throw new AppError('conflict', 409);
    dispatchRequestedJob(result.data, ctx.workspaceId, ctx.user.id);
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: Request) {
  try {
    const ctx = await guard(request, 'write');
    const raw = await request.json();
    if (typeof raw?.instruction === 'string' && raw.instruction.length > MAX_CONTENT_INSTRUCTION_LENGTH)
      throw new AppError('A pauta deve ter no máximo 2.000 caracteres.', 400);
    const input = z
      .object({
        destination: destinationSchema.optional(),
        publication_type: publicationTypeSchema.default('feed'),
        content_id: z.uuid().optional(),
        agent_id: z.uuid(),
        instruction: z.string().max(MAX_CONTENT_INSTRUCTION_LENGTH, 'A pauta deve ter no máximo 2.000 caracteres.').default(''),
        channels: z.array(channelSchema).min(1),
        image_count: z.number().int().min(0).max(20),
        image_style: z.string().max(120).optional(),
        image_quality: z.enum(['low', 'medium', 'high']).optional(),
        is_carousel: z.boolean().optional(),
        cta: z.string().max(500).optional(),
        reference_asset_id: z.uuid().optional(),
        idempotency_key: z.uuid(),
      })
      .parse(raw);

    if (!publicationSelectionValid(input.publication_type, input.channels))
      throw new AppError('Canal incompatível com o tipo de publicação.', 400);
    if (input.publication_type === 'stories' && input.destination && input.destination !== 'stories')
      throw new AppError('Stories deve utilizar o destino Stories.', 400);

    if (input.image_count <= 1) {
      input.is_carousel = false;
    }

    if (input.content_id) {
      const existing = checked(
        await ctx.db
          .from('content_items')
          .select('id, status, agent_id, strategy')
          .eq('id', input.content_id)
          .eq('workspace_id', ctx.workspaceId)
          .maybeSingle(),
      );
      if (!existing) throw new AppError('forbidden', 403);
      if (existing.strategy?.source === 'import') throw new AppError('Conteúdos importados não utilizam geração de imagem.',409);
    }

    const agent = checked(
      await ctx.db
        .from('agents')
        .select('id')
        .eq('id', input.agent_id)
        .eq('workspace_id', ctx.workspaceId)
        .maybeSingle(),
    );
    if (!agent) throw new AppError('forbidden', 403);
    const selectedReference = await requireSelectedReference(ctx.workspaceId, input.agent_id, input.reference_asset_id, true);

    const count = typeof input.image_count === 'number' && input.image_count > 0 ? input.image_count : 1;
    const requiredQuota = contentGenerationQuota(count, input.channels.length, input.image_quality || 'low', Boolean(input.reference_asset_id));

    const { data: userProfile } = await ctx.db
      .from('profiles')
      .select('content_quota_balance,locale')
      .eq('id', ctx.user.id)
      .maybeSingle();

    const currentBalance = userProfile?.content_quota_balance ?? 100;
    if (currentBalance < requiredQuota) {
      throw new AppError(
        `Saldo insuficiente de cotas (${currentBalance}). Esta geração requer ${requiredQuota} cotas. Solicite recarga ao Super Admin.`,
        400,
      );
    }

    // Provider validation runs inside the claimed job so every probe is attributed.
    const db = adminClient();
    const queued = await db.rpc('enqueue_manual_generation', {
      w: ctx.workspaceId, a: input.agent_id, actor_id: ctx.user.id,
      p: { ...input, reference_summary: selectedReference?.summary_text || null, title_language: userProfile?.locale || 'pt-BR' }, k: `${ctx.workspaceId}:manual:${input.idempotency_key}`, c: input.content_id || null,
    });
    if (queued.error || !queued.data) throw new AppError('conflict', 409);
    const job = checked(await db.from('background_jobs').select('id,status').eq('id', queued.data).single());
    if (!job) throw new AppError('internal_error', 500);
    dispatchRequestedJob(job.id, ctx.workspaceId, ctx.user.id);
    return Response.json({ job }, { status: 202 });
  } catch (e) {
    return fail(e);
  }
}
