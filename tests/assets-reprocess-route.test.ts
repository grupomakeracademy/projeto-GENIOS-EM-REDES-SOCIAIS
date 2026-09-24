import { beforeEach,it,expect,vi } from 'vitest';
vi.mock('server-only',()=>({}));
const state=vi.hoisted(()=>({category:'reference',exists:true,process:vi.fn()}));
vi.mock('@/lib/security/context',async original=>({...await original<typeof import('@/lib/security/context')>(),guard:async()=>({workspaceId:'workspace',user:{id:'user'}})}));
vi.mock('@/lib/ai/asset-knowledge',()=>({processAssetKnowledge:state.process,computeContentHash:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({adminClient:()=>({from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:state.exists?{category:state.category}:null,error:null})};return q}})}));
import {PATCH} from '@/app/api/assets/route';
const request=()=>new Request('https://example.test/api/assets',{method:'PATCH',body:JSON.stringify({action:'reprocess',id:'00000000-0000-4000-8000-000000000001'})});
beforeEach(()=>{state.category='reference';state.exists=true;state.process.mockReset()});
it('returns a non-success HTTP status and useful safe message for credential failures',async()=>{
 state.process.mockResolvedValue({status:'failed',error:'authentication_error',visionCallsMade:1});
 const response=await PATCH(request());expect(response.status).toBe(502);
 expect(await response.json()).toMatchObject({ok:false,error:expect.stringContaining('credencial')});
});
it('only reports success after successful service completion',async()=>{
 state.process.mockResolvedValue({status:'processed',visionCallsMade:1});
 const response=await PATCH(request());expect(response.status).toBe(200);expect(await response.json()).toMatchObject({ok:true,status:'processed'});
});
it.each(['protected_identity','exact_asset'])('preserves %s without running AI',async category=>{
 state.category=category;expect((await PATCH(request())).status).toBe(200);expect(state.process).not.toHaveBeenCalled();
});
it('blocks inaccessible assets before processing',async()=>{
 state.exists=false;expect((await PATCH(request())).status).toBe(403);expect(state.process).not.toHaveBeenCalled();
});
