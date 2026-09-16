import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/jobs/eligibility',()=>({assertJobEligible:vi.fn().mockResolvedValue(undefined)}));
const state = vi.hoisted(() => ({
  job: { id:'11111111-1111-4111-8111-111111111111', workspace_id:'22222222-2222-4222-8222-222222222222', lock_token:'33333333-3333-4333-8333-333333333333', type:'agent_run', payload:{origin:'manual'}, attempts:1, max_attempts:3 },
  schedules: [] as Record<string, unknown>[],
  idle: false,
  writes: [] as {table:string; value:Record<string,unknown>}[],
  run: vi.fn(), regenerate: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({adminClient: () => ({
  rpc: async () => ({data:state.idle?[]:[state.job],error:null}),
  from: (table:string) => {
    const query: Record<string,unknown> = {};
    for (const method of ['select','eq','lte','limit','update','insert','upsert']) query[method] = (value:Record<string,unknown>) => {
      if (['update','insert','upsert'].includes(method)) state.writes.push({table,value});
      return query;
    };
    query.maybeSingle = async () => ({data:{checkpoint:{strategy:{topic:'preserve'}}},error:null});
    query.then = (resolve: (value:unknown)=>void) => resolve({data:table==='agent_schedules'?state.schedules:[],error:null});
    return query;
  },
})}));
vi.mock('@/lib/jobs/pipeline', async () => {
  const {z} = await import('zod');
  return {jobSchema:z.any(),runPipeline:state.run,regenerate:state.regenerate,renewLease:vi.fn().mockResolvedValue(undefined)};
});
import {tick} from '@/lib/jobs/worker';
import {assertJobEligible} from '@/lib/jobs/eligibility';
import {ProviderError} from '@/lib/ai/provider-error';
beforeEach(() => {
  state.writes=[];state.schedules=[];state.idle=false;state.job.type='agent_run';state.job.attempts=1;
  state.run.mockReset().mockResolvedValue(undefined);state.regenerate.mockReset().mockResolvedValue(undefined);
});
it('seven simulated hours of idle worker polling perform no generation',async()=>{
  state.idle=true;
  for(let n=0;n<5040;n++) expect(await tick()).toEqual({processed:false});
  expect(state.run).not.toHaveBeenCalled();
  expect(state.regenerate).not.toHaveBeenCalled();
  expect(state.writes).toEqual([]);
});
it('processes a manually queued content', async () => {
  expect(await tick()).toMatchObject({status:'COMPLETED'});
  expect(state.run).toHaveBeenCalledWith(state.job);
});
it('enqueues due routines with an idempotency key and advances their schedule', async () => {
  state.schedules=[{id:'schedule',workspace_id:state.job.workspace_id,agent_id:'agent',next_run_at:'2026-09-14T11:00:00Z',local_time:'08:00',weekdays:[1,2,3,4,5],timezone:'America/Sao_Paulo'}];
  await tick();
  expect(state.writes).toContainEqual({table:'background_jobs',value:expect.objectContaining({idempotency_key:'agent:2026-09-14T11:00:00Z',payload:expect.objectContaining({agent_id:'agent',origin:'routine',schedule_id:'schedule',scheduled_for:'2026-09-14T11:00:00Z'})})});
  expect(state.writes).toContainEqual({table:'agent_schedules',value:{next_run_at:expect.any(String)}});
});
it('retries incomplete output within a finite budget and retains diagnostics/checkpoints', async () => {
  const diagnostic={provider:'openai',operation:'image',code:'missing_image'};
  state.run.mockRejectedValue(new ProviderError('invalid_output',diagnostic));
  expect(await tick()).toMatchObject({status:'RETRYING'});
  expect(state.writes).toContainEqual({table:'agent_runs',value:{checkpoint:{strategy:{topic:'preserve'},provider_error:diagnostic}}});
  state.job.attempts=3;
  expect(await tick()).toMatchObject({status:'FAILED'});
});
it('does not loop on invalid configuration or unavailable provider balance', async () => {
  state.run.mockRejectedValue(new ProviderError('provider_request_rejected',{provider:'openai',operation:'image',status:400}));
  expect(await tick()).toMatchObject({status:'FAILED',error:'provider_request_rejected'});
  state.run.mockRejectedValue(new Error('provider_quota_exceeded'));
  expect(await tick()).toMatchObject({status:'FAILED',error:'provider_quota_exceeded'});
});
it('routes regeneration through the existing regeneration pipeline', async () => {
  state.job.type='regenerate_image';
  expect(await tick()).toMatchObject({status:'COMPLETED'});
  expect(state.regenerate).toHaveBeenCalledWith(state.job);
  expect(state.run).not.toHaveBeenCalled();
});
it('ends an ineligible job without generating or scheduling a retry',async()=>{
  vi.mocked(assertJobEligible).mockRejectedValueOnce(new Error('job_not_eligible'));
  expect(await tick()).toMatchObject({status:'FAILED',error:'job_not_eligible'});
  expect(state.run).not.toHaveBeenCalled();
  expect(state.regenerate).not.toHaveBeenCalled();
  expect(state.writes).toContainEqual({table:'background_jobs',value:expect.objectContaining({status:'FAILED',last_error:'job_not_eligible'})});
});
