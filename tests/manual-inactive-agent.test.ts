import {expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const s=vi.hoisted(()=>({active:false}));
vi.mock('@/lib/supabase/server',()=>({adminClient:()=>({from:(table:string)=>{
  if(table==='agent_runs') throw new Error('reached_run_creation');
  const q:Record<string,unknown>={};
  q.select=q.eq=()=>q;
  q.single=async()=>({data:{id:'a',name:'Agent',briefing:{},text_settings:{},visual_settings:{},channels:['instagram'],content_language:'pt-BR',mode:'ASSISTED',approval_required:true,research_enabled:false,image_count:1,active:s.active},error:null});
  return q;
}})}));
import {runPipeline,type Job} from '@/lib/jobs/pipeline';
const job=(origin:string)=>({id:'11111111-1111-4111-8111-111111111111',workspace_id:'22222222-2222-4222-8222-222222222222',payload:{agent_id:'33333333-3333-4333-8333-333333333333',origin}} as unknown as Job);
it('manual creation proceeds with routine switched off',async()=>{
  s.active=false;
  await expect(runPipeline(job('manual'))).rejects.toThrow('reached_run_creation');
});
it('routine creation cannot proceed with agent switched off',async()=>{
  s.active=false;
  await expect(runPipeline(job('routine'))).rejects.toThrow('invalid_input');
});
it('active routine reaches run creation',async()=>{
  s.active=true;
  await expect(runPipeline(job('routine'))).rejects.toThrow('reached_run_creation');
});
