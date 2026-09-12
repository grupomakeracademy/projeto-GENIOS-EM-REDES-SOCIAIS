import { z } from 'zod';
import { agentSchema } from '@/lib/domain';
import { guard, checked, fail, AppError } from '@/lib/security/context';
import { adminClient } from '@/lib/supabase/server';
import { nextOccurrence } from '@/lib/jobs/scheduling';
import { AIService } from '@/lib/ai/service';
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
    if (raw.action === 'magic') {
      const { instructions } = z.object({ instructions: z.string().min(3).max(10000) }).parse(raw);
      return Response.json(
        await new AIService(ctx.workspaceId).text('text', z.object({ suggestion: z.string() }), {
          task: 'Improve these brand writing instructions, preserve intent. Never apply automatically.',
          instructions,
        }),
      );
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
