import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only',()=>({}));
const state=vi.hoisted(()=>({superAdmin:false,role:'ADMIN',write:vi.fn()}));
vi.mock('@/lib/security/context',async original=>({
  ...await original<typeof import('@/lib/security/context')>(),
  guard:async()=>({workspaceId:'workspace',role:state.role,user:{id:'user',email:'user@example.test',app_metadata:{super_admin:state.superAdmin}}}),
}));
vi.mock('@/lib/supabase/server',()=>({adminClient:()=>({from:()=>{
 const q={insert:(v:unknown)=>{state.write('insert',v);return q},update:(v:unknown)=>{state.write('update',v);return q},delete:()=>{state.write('delete');return q},eq:()=>q,select:()=>q,single:async()=>({data:{id:'video'},error:null}),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:null,error:null}).then(resolve)};return q;
}})}));
import {POST,PATCH,DELETE} from '@/app/api/university/route';
const body={id:'00000000-0000-4000-8000-000000000001',title:'Training',description:'Full description',video_url:'https://example.test/video.mp4'};
beforeEach(()=>{state.superAdmin=false;state.role='ADMIN';state.write.mockClear()});
for(const [method,handler] of [['POST',POST],['PATCH',PATCH],['DELETE',DELETE]] as const){
 it.each(['ADMIN','EDITOR','VIEWER'])(`blocks ${method} for non-Super-Admin %s before any write`,async role=>{
  state.role=role;const response=await handler(new Request('https://example.test/api/university',{method,body:JSON.stringify(body)}));
  expect(response.status).toBe(403);expect(state.write).not.toHaveBeenCalled();
 });
 it(`preserves Super Admin ${method}`,async()=>{
  state.superAdmin=true;const response=await handler(new Request('https://example.test/api/university',{method,body:JSON.stringify(body)}));
  expect(response.status).toBe(200);expect(state.write).toHaveBeenCalledTimes(1);
 });
}
