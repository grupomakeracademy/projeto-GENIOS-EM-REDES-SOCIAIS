import { z } from 'zod';
import { guard, checked, fail, AppError } from '@/lib/security/context';
import { adminClient } from '@/lib/supabase/server';
import { channelSchema } from '@/lib/domain';
import { AIService } from '@/lib/ai/service';
import { executionResponsibles } from '@/features/content/responsibles';
import { requireAgent } from '@/lib/security/agent';
export async function GET(request: Request) {
  try {
    const ctx = await guard(request);
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
    const job = checked(
      await ctx.db
        .from('background_jobs')
        .select('id')
        .eq('workspace_id', ctx.workspaceId)
        .eq('id', id)
        .eq('type', 'agent_run')
        .eq('status', 'FAILED')
        .maybeSingle(),
    );
    if (!job) throw new AppError('conflict', 409);
    const updated = checked(
      await adminClient()
        .from('background_jobs')
        .update({
          status: 'PENDING',
          attempts: 0,
          last_error: null,
          lease_until: null,
          lock_token: null,
          completed_at: null,
          scheduled_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('workspace_id', ctx.workspaceId)
        .eq('status', 'FAILED')
        .select('id')
        .maybeSingle(),
    );
    if (!updated) throw new AppError('conflict', 409);
    await adminClient()
      .from('agent_runs')
      .update({ status: 'PENDING', error_code: null })
      .eq('job_id', id);
    await adminClient()
      .from('content_items')
      .update({ status: 'GENERATING' })
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId);
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: Request) {
  try {
    const ctx = await guard(request, 'write');
    const input = z
      .object({
        content_id: z.uuid().optional(),
        agent_id: z.uuid(),
        instruction: z.string().max(10000).default(''),
        channels: z.array(channelSchema).min(1),
        image_count: z.number().int().min(0).max(20),
        image_style: z.string().max(120).optional(),
        image_quality: z.enum(['low', 'medium', 'high']).optional(),
        is_carousel: z.boolean().optional(),
        cta: z.string().max(500).optional(),
        idempotency_key: z.uuid(),
      })
      .parse(await request.json());

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

    const qualityMultiplier =
      input.image_quality === 'medium' || input.image_quality === 'high' ? 3 : 1;
    const count = typeof input.image_count === 'number' && input.image_count > 0 ? input.image_count : 1;
    const requiredQuota = count * input.channels.length * qualityMultiplier;

    const { data: userProfile } = await ctx.db
      .from('profiles')
      .select('content_quota_balance')
      .eq('id', ctx.user.id)
      .maybeSingle();

    const currentBalance = userProfile?.content_quota_balance ?? 100;
    if (currentBalance < requiredQuota) {
      throw new AppError(
        `Saldo insuficiente de cotas (${currentBalance}). Esta geração requer ${requiredQuota} cotas. Solicite recarga ao Super Admin.`,
        400,
      );
    }

    const ai = new AIService(ctx.workspaceId, undefined, input.agent_id);
    for (const purpose of [
      'orchestrator',
      'text',
      'embedding',
      ...(input.image_count ? ['image'] : []),
    ] as const) {
      const config = await ai.config(purpose as 'orchestrator' | 'text' | 'embedding' | 'image');
      await ai.key(config);
    }
    const db = adminClient(),
      key = `${ctx.workspaceId}:manual:${input.idempotency_key}`;

    if (input.content_id) {
      await db
        .from('content_items')
        .update({
          agent_id: input.agent_id,
          topic: input.instruction.trim() || 'Conteúdo gerado',
          strategy: {
            image_style: input.image_style || 'Disney / Pixar',
            image_quality: input.image_quality || 'low',
            is_carousel: input.is_carousel ?? false,
            cta: input.cta || '',
            channels: input.channels,
            image_count: input.image_count,
            instruction: input.instruction.trim(),
          },
          status: 'GENERATING',
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.content_id)
        .eq('workspace_id', ctx.workspaceId);

      await db.from('content_events').insert({
        workspace_id: ctx.workspaceId,
        content_id: input.content_id,
        actor: ctx.user.id,
        event: 'CONTENT_GENERATION_STARTED',
        metadata: { origin: 'draft', channels: input.channels },
      });

      checked(
        await db.from('background_jobs').upsert(
          {
            id: input.content_id,
            workspace_id: ctx.workspaceId,
            type: 'agent_run',
            status: 'PENDING',
            attempts: 0,
            last_error: null,
            completed_at: null,
            lease_until: null,
            lock_token: null,
            scheduled_at: new Date().toISOString(),
            payload: { ...input, created_by: ctx.user.id, origin: 'manual', content_id: input.content_id },
            idempotency_key: key,
          },
          { onConflict: 'id' },
        ),
      );

      return Response.json(
        {
          job: checked(
            await db.from('background_jobs').select('id,status').eq('id', input.content_id).single(),
          ),
        },
        { status: 202 },
      );
    }

    checked(
      await db.from('background_jobs').upsert(
        {
          workspace_id: ctx.workspaceId,
          type: 'agent_run',
          payload: { ...input, created_by: ctx.user.id, origin: 'manual' },
          idempotency_key: key,
        },
        { onConflict: 'idempotency_key', ignoreDuplicates: true },
      ),
    );
    return Response.json(
      {
        job: checked(
          await db.from('background_jobs').select('id,status').eq('idempotency_key', key).single(),
        ),
      },
      { status: 202 },
    );
  } catch (e) {
    return fail(e);
  }
}
