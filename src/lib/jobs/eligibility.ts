import { DateTime } from 'luxon';
import { adminClient } from '@/lib/supabase/server';
import { checked } from '@/lib/security/context';
import type { Job } from './pipeline';

export function routineMatches(
  payload: Record<string, unknown>,
  schedule: {
    id: string;
    enabled: boolean;
    local_time: string;
    timezone: string;
    weekdays: number[];
  },
  now = new Date(),
) {
  if (
    !schedule.enabled ||
    payload.schedule_id !== schedule.id ||
    typeof payload.scheduled_for !== 'string'
  )
    return false;
  const due = DateTime.fromISO(payload.scheduled_for, { zone: 'utc' }).setZone(schedule.timezone);
  return (
    due.isValid &&
    due.toMillis() <= now.getTime() &&
    due.toFormat('HH:mm') === schedule.local_time &&
    schedule.weekdays.includes(due.weekday) &&
    payload.schedule_fingerprint ===
      JSON.stringify([schedule.local_time, schedule.weekdays, schedule.timezone])
  );
}

/** Rechecked before every provider call so cancellation cannot leave a stale job generating. */
export async function assertJobEligible(job: Job) {
  const db = adminClient();
  const live = checked(
    await db
      .from('background_jobs')
      .select('status,lock_token,lease_until,payload')
      .eq('id', job.id)
      .eq('workspace_id', job.workspace_id)
      .maybeSingle(),
  );
  if (
    !live ||
    live.status !== 'RUNNING' ||
    live.lock_token !== job.lock_token ||
    !Number.isFinite(Date.parse(live.lease_until)) ||
    Date.parse(live.lease_until) <= Date.now() ||
    live.payload.deleted
  )
    throw new Error('lease_lost');
  const agent = checked(
    await db
      .from('agents')
      .select('id,active')
      .eq('id', String(job.payload.agent_id || ''))
      .eq('workspace_id', job.workspace_id)
      .maybeSingle(),
  );
  if (!agent) throw new Error('job_not_eligible');
  if (job.payload.origin === 'routine' || job.payload.dispatch_mode !== 'user_request')
    throw new Error('job_not_eligible');
  const contentId = String(job.payload.content_id || job.id);
  const content = checked(
    await db
      .from('content_items')
      .select('status,strategy')
      .eq('id', contentId)
      .eq('workspace_id', job.workspace_id)
      .maybeSingle(),
  );
  if (
    (!content && job.payload.content_id) ||
    content?.status === 'ARCHIVED' ||
    content?.strategy?.source === 'import'
  )
    throw new Error('job_not_eligible');
  const run = checked(
    await db
      .from('agent_runs')
      .select('id')
      .eq('job_id', job.id)
      .eq('workspace_id', job.workspace_id)
      .maybeSingle(),
  );
  return { runId: run?.id as string | undefined };
}
