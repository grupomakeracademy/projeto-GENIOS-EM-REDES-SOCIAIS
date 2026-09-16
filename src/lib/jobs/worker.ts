import 'server-only';
import { adminClient } from '@/lib/supabase/server';
import { checked } from '@/lib/security/context';
import { backoff, nextOccurrence } from './scheduling';
import { jobSchema, runPipeline, regenerate, renewLease } from './pipeline';
import { ProviderError } from '@/lib/ai/provider-error';
import { withAICallContext } from '@/lib/ai/audit';
import { assertJobEligible } from './eligibility';
export async function tick() {
  const db = adminClient(),
    now = new Date();
  const schedules = checked(
    await db
      .from('agent_schedules')
      .select('*,agents!inner(active)')
      .eq('enabled', true)
      .eq('agents.active', true)
      .lte('next_run_at', now.toISOString())
      .limit(50),
  );
  for (const schedule of schedules || []) {
    const key = `${schedule.agent_id}:${schedule.next_run_at}`;
    checked(
      await db.from('background_jobs').upsert(
        {
          workspace_id: schedule.workspace_id,
          type: 'agent_run',
          payload: { agent_id: schedule.agent_id, origin: 'routine', schedule_id: schedule.id, scheduled_for: schedule.next_run_at, schedule_fingerprint: JSON.stringify([schedule.local_time,schedule.weekdays,schedule.timezone]) },
          idempotency_key: key,
        },
        { onConflict: 'idempotency_key', ignoreDuplicates: true },
      ),
    );
    const next = nextOccurrence(schedule.local_time, schedule.weekdays, schedule.timezone, now);
    checked(
      await db
        .from('agent_schedules')
        .update({ next_run_at: next.toISOString() })
        .eq('id', schedule.id)
        .eq('next_run_at', schedule.next_run_at),
    );
  }
  const claimed = checked(await db.rpc('claim_job'));
  if (!claimed?.length) return { processed: false };
  const job = jobSchema.parse(claimed[0]);
  try {
    await assertJobEligible(job);
    await withAICallContext({
      trigger:job.attempts>1?'retry':job.payload.origin==='routine'?'scheduled_routine':'user_action',
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
    ];
    const code =
      error instanceof Error && safe.includes(error.message) ? error.message : 'internal_error';
    if (code === 'lease_lost') return { processed: false, id: job.id, status: 'LEASE_LOST' };
    const retry =
      ['timeout', 'provider_unavailable', 'rate_limit', 'invalid_output'].includes(code) &&
      job.attempts < job.max_attempts;
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
          status: retry ? 'PENDING' : 'FAILED',
          scheduled_at: new Date(Date.now() + backoff(job.attempts) * 1000).toISOString(),
          last_error: code,
          lease_until: null,
        })
        .eq('id', job.id)
        .eq('lock_token', job.lock_token),
    );
    checked(
      await db
        .from('agent_runs')
        .update({ status: retry ? 'RETRYING' : 'FAILED', error_code: code })
        .eq('job_id', job.id),
    );
    if (!retry) {
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
    return { processed: true, id: job.id, status: retry ? 'RETRYING' : 'FAILED', error: code };
  }
}
