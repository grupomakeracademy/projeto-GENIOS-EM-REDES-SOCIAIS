import { z } from 'zod';
import { guard, checked, fail, AppError } from '@/lib/security/context';
import { adminClient } from '@/lib/supabase/server';

export async function DELETE(request: Request) {
  try {
    const ctx = await guard(request, 'write');
    const { id, kind } = z
      .object({ id: z.uuid(), kind: z.enum(['run', 'content']) })
      .parse(await request.json());
    const db = adminClient();
    let contentId: string = id;
    if (kind === 'run') {
      const job = checked(
        await ctx.db
          .from('background_jobs')
          .select('id')
          .eq('workspace_id', ctx.workspaceId)
          .eq('id', id)
          .eq('type', 'agent_run')
          .maybeSingle(),
      );
      if (!job) throw new AppError('forbidden', 403);
      const run = checked(
        await ctx.db
          .from('agent_runs')
          .select('content_id')
          .eq('workspace_id', ctx.workspaceId)
          .eq('job_id', id)
          .maybeSingle(),
      );
      contentId = run?.content_id || id;
    } else {
      const item = checked(
        await ctx.db
          .from('content_items')
          .select('id')
          .eq('workspace_id', ctx.workspaceId)
          .eq('id', id)
          .maybeSingle(),
      );
      if (!item) throw new AppError('forbidden', 403);
    }
    // Keep a tombstone and usage history; revoke leases before removing content.
    const related = checked(
      await db
        .from('agent_runs')
        .select('job_id')
        .eq('workspace_id', ctx.workspaceId)
        .eq('content_id', contentId),
    );
    const ids = [...new Set([id, ...(related || []).map((r) => r.job_id)])];
    const jobs = checked(
      await db
        .from('background_jobs')
        .select('id,payload')
        .eq('workspace_id', ctx.workspaceId)
        .or(`id.in.(${ids.join(',')}),payload->>content_id.eq.${contentId}`),
    );
    for (const job of jobs || [])
      checked(
        await db
          .from('background_jobs')
          .update({
            status: 'COMPLETED',
            payload: { ...job.payload, deleted: true },
            lock_token: null,
            lease_until: null,
            completed_at: new Date().toISOString(),
          })
          .eq('workspace_id', ctx.workspaceId)
          .eq('id', job.id),
      );
    checked(
      await db
        .from('agent_runs')
        .update({ content_id: null })
        .eq('workspace_id', ctx.workspaceId)
        .eq('content_id', contentId),
    );
    checked(
      await db
        .from('content_items')
        .delete()
        .eq('workspace_id', ctx.workspaceId)
        .eq('id', contentId),
    );
    return Response.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
