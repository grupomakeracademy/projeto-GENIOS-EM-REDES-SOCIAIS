import { z } from 'zod';
import { agentSchema } from '@/lib/domain';
import { newAgentBriefing } from '@/features/agents/new-schema';
import { requireAgent } from '@/lib/security/agent';
import { guard, checked, fail, AppError } from '@/lib/security/context';
import { adminClient } from '@/lib/supabase/server';
import { nextOccurrence } from '@/lib/jobs/scheduling';
export async function GET(request: Request) {
  try {
    const ctx = await guard(request);
    return Response.json({
      items: checked(
        await ctx.db
          .from('agents')
          .select('*')
          .eq('workspace_id', ctx.workspaceId)
          .order('created_at')
          .limit(100),
      ),
    });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: Request) {
  try {
    const ctx = await guard(request, 'write'),
      raw = await request.json();
    if (raw.action && !['create_with_briefing', 'schedule'].includes(raw.action))
      throw new AppError('invalid_input');
    if (raw.text_settings && Object.hasOwn(raw.text_settings, 'ai_configs'))
      throw new AppError('forbidden', 403);
    if (raw.action === 'create_with_briefing') {
      const draft = newAgentBriefing.parse(raw.draft);
      const next = nextOccurrence(draft.local_time, draft.weekdays, draft.timezone);
      const id = checked(
        await adminClient().rpc('create_configured_agent', {
          w: ctx.workspaceId,
          actor_id: ctx.user.id,
          p: {
            name: draft.agentName,
            briefing: draft,
            text_settings: { instructions: draft.communication },
            visual_settings: { instructions: draft.visual, reference_ids: [] },
            channels: draft.channels,
            content_language: 'pt-BR',
            mode: 'ASSISTED',
            approval_required: draft.approval_required,
            image_count: 1,
          },
          s: {
            enabled: draft.enabled,
            timezone: draft.timezone,
            local_time: draft.local_time,
            weekdays: draft.weekdays,
            next_run_at: next.toISOString(),
          },
        }),
      );
      return Response.json({ id }, { status: 201 });
    }
    if (raw.action === 'schedule') {
      const input = z
        .object({
          id: z.uuid(),
          timezone: z.string(),
          local_time: z.string(),
          weekdays: z.array(z.number().int().min(1).max(7)).min(1),
          enabled: z.boolean(),
        })
        .parse(raw);
      const agent = checked(
        await ctx.db
          .from('agents')
          .select('id')
          .eq('id', input.id)
          .eq('workspace_id', ctx.workspaceId)
          .maybeSingle(),
      );
      if (!agent) throw new AppError('forbidden', 403);
      const next = nextOccurrence(input.local_time, input.weekdays, input.timezone);
      checked(
        await adminClient().from('agent_schedules').upsert(
          {
            workspace_id: ctx.workspaceId,
            agent_id: input.id,
            timezone: input.timezone,
            local_time: input.local_time,
            weekdays: input.weekdays,
            enabled: input.enabled,
            next_run_at: next.toISOString(),
          },
          { onConflict: 'agent_id' },
        ),
      );
      return Response.json({ ok: true });
    }
    const input = agentSchema.parse(raw),
      id = raw.id ? z.uuid().parse(raw.id) : undefined;
    if (!id) throw new AppError('invalid_input');
    await requireAgent(ctx, id);
    const current = checked(
      await ctx.db
        .from('agents')
        .select('text_settings')
        .eq('id', id)
        .eq('workspace_id', ctx.workspaceId)
        .single(),
    );
    if (current?.text_settings?.ai_configs !== undefined)
      input.text_settings.ai_configs = current.text_settings.ai_configs;
    const references = z
      .array(z.uuid())
      .max(100)
      .parse(input.visual_settings.reference_ids || []);
    if (references.length) {
      const assets =
        checked(
          await ctx.db
            .from('assets')
            .select('id')
            .eq('workspace_id', ctx.workspaceId)
            .in('id', references),
        ) || [];
      if (assets.length !== new Set(references).size) throw new AppError('forbidden', 403);
    }
    const data = id
      ? checked(
          await ctx.db
            .from('agents')
            .update({ ...input, updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('workspace_id', ctx.workspaceId)
            .select()
            .single(),
        )
      : checked(
          await ctx.db
            .from('agents')
            .insert({ ...input, workspace_id: ctx.workspaceId })
            .select()
            .single(),
        );
    checked(
      await adminClient()
        .from('audit_logs')
        .insert({
          workspace_id: ctx.workspaceId,
          actor: ctx.user.id,
          event: id ? 'AGENT_UPDATED' : 'AGENT_CREATED',
          metadata: { agent_id: data.id },
        }),
    );
    return Response.json(data);
  } catch (e) {
    return fail(e);
  }
}
