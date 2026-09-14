import { z } from 'zod';
import { agentSchema } from '@/lib/domain';
import { newAgentBriefing } from '@/features/agents/new-schema';
import { requireAgent } from '@/lib/security/agent';
import { guard, checked, fail, AppError } from '@/lib/security/context';
import { adminClient } from '@/lib/supabase/server';
import { nextOccurrence } from '@/lib/jobs/scheduling';
import { isSuperAdmin } from '@/lib/security/super-admin';

export async function GET(request: Request) {
  try {
    const ctx = await guard(request);
    const isSuper = isSuperAdmin(ctx.user);
    const query = isSuper
      ? adminClient().from('agents').select('*').order('name').limit(100)
      : ctx.db
          .from('agents')
          .select('*')
          .eq('workspace_id', ctx.workspaceId)
          .order('created_at')
          .limit(100);
    return Response.json({
      items: checked(await query),
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
          id: z.uuid().optional(),
          agent_id: z.uuid().optional(),
          timezone: z.string(),
          local_time: z.string(),
          weekdays: z.array(z.number().int().min(1).max(7)).min(1),
          enabled: z.boolean(),
        })
        .parse(raw);
      let targetAgentId = input.agent_id || input.id;
      if (!targetAgentId) throw new AppError('invalid_input');
      let agent = checked(
        await ctx.db
          .from('agents')
          .select('id')
          .eq('id', targetAgentId)
          .eq('workspace_id', ctx.workspaceId)
          .maybeSingle(),
      );
      if (!agent && input.id) {
        const sched = checked(
          await ctx.db
            .from('agent_schedules')
            .select('agent_id')
            .eq('id', input.id)
            .eq('workspace_id', ctx.workspaceId)
            .maybeSingle(),
        );
        if (sched?.agent_id) {
          targetAgentId = sched.agent_id;
          agent = checked(
            await ctx.db
              .from('agents')
              .select('id')
              .eq('id', targetAgentId)
              .eq('workspace_id', ctx.workspaceId)
              .maybeSingle(),
          );
        }
      }
      if (!agent) throw new AppError('forbidden', 403);
      const next = nextOccurrence(input.local_time, input.weekdays, input.timezone);
      checked(
        await adminClient().from('agent_schedules').upsert(
          {
            workspace_id: ctx.workspaceId,
            agent_id: targetAgentId,
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
    const isSuper = isSuperAdmin(ctx.user);
    const db = isSuper ? adminClient() : ctx.db;
    let currentQuery = db.from('agents').select('text_settings, visual_settings, workspace_id').eq('id', id);
    if (!isSuper) currentQuery = currentQuery.eq('workspace_id', ctx.workspaceId);
    const current = checked(await currentQuery.single());

    if (current?.text_settings?.ai_configs !== undefined)
      input.text_settings.ai_configs = current.text_settings.ai_configs;
    const references = z
      .array(z.uuid())
      .max(100)
      .parse(input.visual_settings.reference_ids || []);
    if (references.length) {
      const assetQuery = isSuper
        ? adminClient().from('assets').select('id').in('id', references)
        : ctx.db.from('assets').select('id').in('id', references);
      const assets = checked(await assetQuery) || [];
      const currentRefIds = new Set(
        Array.isArray(current?.visual_settings?.reference_ids)
          ? current.visual_settings.reference_ids
          : [],
      );
      const validIds = new Set(assets.map((a: { id: string }) => a.id));
      const allValid = references.every((ref) => validIds.has(ref) || currentRefIds.has(ref));
      if (!allValid && !isSuper) throw new AppError('forbidden', 403);
    }
    const targetWs = current?.workspace_id || ctx.workspaceId;
    let updateQuery = db
      .from('agents')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (!isSuper) updateQuery = updateQuery.eq('workspace_id', ctx.workspaceId);
    const data = id
      ? checked(await updateQuery.select().single())
      : checked(
          await db
            .from('agents')
            .insert({ ...input, workspace_id: targetWs })
            .select()
            .single(),
        );
    checked(
      await adminClient()
        .from('audit_logs')
        .insert({
          workspace_id: targetWs,
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
