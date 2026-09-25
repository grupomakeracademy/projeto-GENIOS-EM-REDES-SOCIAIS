import 'server-only';
import { adminClient } from '@/lib/supabase/server';
import { checked } from '@/lib/security/context';
import { jobSchema, runPipeline, regenerate, renewLease } from './pipeline';
import { ProviderError } from '@/lib/ai/provider-error';
import { withAICallContext } from '@/lib/ai/audit';
import { assertJobEligible } from './eligibility';
import { nextOccurrence } from './scheduling';
import { publishVariantContent } from '@/lib/social/publisher';

export async function tick() {
  const db = adminClient(),
    now = new Date();
  // Terminal housekeeping only. Expiry never schedules or executes AI.
  checked(await db.rpc('expire_generation_jobs'));

  // Processar conteúdos agendados que atingiram o horário de publicação
  const dueItems = checked(
    await db
      .from('content_items')
      .select('id, workspace_id, scheduled_at')
      .eq('status', 'SCHEDULED')
      .lte('scheduled_at', now.toISOString())
      .limit(10),
  );

  for (const item of dueItems || []) {
    try {
      await db
        .from('content_items')
        .update({ status: 'PUBLISHING' })
        .eq('id', item.id)
        .eq('status', 'SCHEDULED');

      await publishVariantContent({
        workspaceId: item.workspace_id,
        contentId: item.id,
      });
    } catch (schedErr) {
      console.error(`[Worker] Failed to publish scheduled content ${item.id}:`, schedErr);
      await db
        .from('content_items')
        .update({ status: 'FAILED' })
        .eq('id', item.id);
    }
  }

  // Only explicitly authorized, due schedule occurrences may create generation jobs.
  const schedules = checked(await db.from('agent_schedules').select('*')
    .eq('enabled', true).not('requested_by', 'is', null).lte('next_run_at', now.toISOString()).limit(20));
  await Promise.all((schedules || []).map(async schedule => {
    if (!schedule.requested_by) return;
    try {
      const next = nextOccurrence(schedule.local_time, schedule.weekdays, schedule.timezone);
      const id = checked(await db.rpc('dispatch_schedule', {
        sid: schedule.id, expected: schedule.next_run_at, next_due: next.toISOString(),
        fingerprint: JSON.stringify([schedule.local_time, schedule.weekdays, schedule.timezone]),
      }));
      if (id) await processRequestedJob(id, schedule.workspace_id, schedule.requested_by);
    } catch { console.error('[Routine] Occurrence failed', { scheduleId: schedule.id }); }
  }));
  return { processed: false };
}

/** Process only the job dispatched by a validated user request. */
export async function processRequestedJob(id: string, workspaceId: string, actorId: string) {
  const db = adminClient();
  const claimed = checked(await db.rpc('claim_requested_job', { j: id, w: workspaceId, actor_id: actorId }));
  if (!claimed?.length) return { processed: false };
  const job = jobSchema.parse(claimed[0]);
  try {
    await assertJobEligible(job);
    await withAICallContext({
      trigger:job.payload.origin === 'routine' ? 'scheduled_routine' : job.attempts>1?'retry':'user_action', attempt:job.attempts,
      source:'src/lib/jobs/pipeline.ts',reason:job.type,jobId:job.id,
      contentId:String(job.payload.content_id || job.id),agentId:String(job.payload.agent_id || ''),
      beforeCall:()=>assertJobEligible(job),
    },async()=>{
    if (job.type === 'agent_run') await runPipeline(job);
    else if (job.type === 'regenerate_copy' || job.type === 'regenerate_image')
      await regenerate(job);
    else throw new Error('unsupported_capability');
    });
    await renewLease(job);
    checked(
      await db
        .from('background_jobs')
        .update({
          status: 'COMPLETED',
          completed_at: new Date().toISOString(),
          lease_until: null,
          last_error: null,
        })
        .eq('id', job.id)
        .eq('lock_token', job.lock_token),
    );
    return { processed: true, id: job.id, status: 'COMPLETED' };
  } catch (error) {
    // A deleted execution has revoked its lease and must not emit new failures.
    try {
      await renewLease(job);
    } catch {
      return { processed: false, id: job.id, status: 'LEASE_LOST' };
    }
    console.error(`[Worker] Job ${job.id} (${job.type}) failed:`, error);
    // Always log the full technical root cause — the frontend only receives the sanitised 'code'.
    // This ensures that when code === 'internal_error', the real error message is never silently lost.
    if (error instanceof Error) {
      console.error('[Worker] Root cause:', {
        job_id: job.id,
        type: job.type,
        attempt: job.attempts,
        message: error.message,
        // Only include the first 8 lines of the stack to keep logs readable
        stack: error.stack?.split('\n').slice(0, 8).join('\n'),
      });
    }
    const safe = [
      'provider_missing',
      'research_not_configured',
      'authentication_error',
      'timeout',
      'provider_unavailable',
      'rate_limit',
      'invalid_output',
      'provider_request_rejected',
      'provider_quota_exceeded',
      'content_policy',
      'repetitive_topic',
      'unsupported_capability',
      'conflict',
      'invalid_input',
      'lease_lost',
      'insufficient_quota',
      'job_not_eligible',
      'storage_quota_exceeded',
    ];
    const code =
      error instanceof Error && safe.includes(error.message) ? error.message : 'internal_error';
    if (code === 'lease_lost') return { processed: false, id: job.id, status: 'LEASE_LOST' };
    if (error instanceof ProviderError) {
      const run = checked(await db.from('agent_runs').select('checkpoint').eq('job_id', job.id).maybeSingle());
      if (run) checked(await db.from('agent_runs').update({
        checkpoint: { ...run.checkpoint, provider_error: error.diagnostic },
      }).eq('job_id', job.id));
    }
    checked(
      await db
        .from('background_jobs')
        .update({
          status: 'FAILED',
          completed_at: new Date().toISOString(),
          last_error: code,
          lease_until: null,
        })
        .eq('id', job.id)
        .eq('lock_token', job.lock_token),
    );
    checked(
      await db
        .from('agent_runs')
        .update({ status: 'FAILED', error_code: code, completed_at: new Date().toISOString() })
        .eq('job_id', job.id),
    );
    {
      const id = String(job.payload.content_id || job.id);
      if (job.type === 'regenerate_image' || job.type === 'regenerate_copy') {
        // Critical requirement: Regeneration failure must NEVER invalidate the original valid content into 'FAILED'.
        // Restore content status back to its previous status (e.g. 'AWAITING_REVIEW' or 'ROUTINE')
        const previousStatus =
          ((job.payload as Record<string, unknown>)?.previous_status as string) ||
          'AWAITING_REVIEW';
        await db
          .from('content_items')
          .update({ status: previousStatus })
          .eq('id', id)
          .eq('workspace_id', job.workspace_id)
          .eq('status', 'GENERATING');
        await db
          .from('notifications')
          .insert({
            workspace_id: job.workspace_id,
            message: `Falha na regeneração (${code})`,
            href: `/contents/${id}`,
          });
      } else {
        checked(
          await db
            .from('content_items')
            .update({ status: 'FAILED' })
            .eq('id', id)
            .eq('workspace_id', job.workspace_id)
            .eq('status', 'GENERATING'),
        );
        checked(
          await db
            .from('notifications')
            .insert({
              workspace_id: job.workspace_id,
              message: code,
              href: '/contents?status=FAILED',
            }),
        );
      }
    }
    return { processed: true, id: job.id, status: 'FAILED', error: code };
  }
}
