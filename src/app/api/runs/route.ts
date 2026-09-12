import { z } from 'zod';
import { guard, checked, fail, AppError } from '@/lib/security/context';
import { adminClient } from '@/lib/supabase/server';
import { channelSchema } from '@/lib/domain';
import { AIService, credential } from '@/lib/ai/service';
export async function GET(request: Request) {
  try {
    const ctx = await guard(request);
    const jobs = checked(
      await ctx.db
        .from('background_jobs')
        .select('id,status,payload,last_error,scheduled_at,agent_runs(stage,content_id)')
        .eq('workspace_id', ctx.workspaceId)
        .eq('type', 'agent_run')
        .in('status', ['PENDING', 'RUNNING', 'FAILED'])
        .order('scheduled_at', { ascending: false })
        .limit(100),
    );
    return Response.json(
      {
        items: (jobs || []).map((job) => ({
          id: job.id,
          status: job.status,
          agentId: job.payload.agent_id,
          instruction: String(job.payload.instruction || '').slice(0, 240),
          channels: job.payload.channels || [],
          error: job.last_error,
          stage: job.agent_runs?.[0]?.stage || 'LOAD_CONTEXT',
          contentId: job.agent_runs?.[0]?.content_id || null,
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
        agent_id: z.uuid(),
        instruction: z.string().max(10000).default(''),
        channels: z.array(channelSchema).min(1),
        image_count: z.number().int().min(0).max(20),
        idempotency_key: z.uuid(),
      })
      .parse(await request.json());
    const agent = checked(
      await ctx.db
        .from('agents')
        .select('id')
        .eq('id', input.agent_id)
        .eq('workspace_id', ctx.workspaceId)
        .maybeSingle(),
    );
    if (!agent) throw new AppError('forbidden', 403);
    const ai = new AIService(ctx.workspaceId);
    for (const purpose of [
      'orchestrator',
      'text',
      'embedding',
      ...(input.image_count ? ['image'] : []),
    ] as const) {
      const config = await ai.config(purpose as 'orchestrator' | 'text' | 'embedding' | 'image');
      await credential(ctx.workspaceId, config.provider);
    }
    const db = adminClient(),
      key = `${ctx.workspaceId}:manual:${input.idempotency_key}`;
    checked(
      await db.from('background_jobs').upsert(
        {
          workspace_id: ctx.workspaceId,
          type: 'agent_run',
          payload: { ...input, created_by: ctx.user.id },
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
