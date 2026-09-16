import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import sharp from 'sharp';
vi.mock('server-only',()=>({}));
const state=vi.hoisted(()=>({row:{id:'draft',agent_id:'agent',caption:'',magic_used_at:null,content_id:null} as Record<string,unknown>,stored:null as Uint8Array<ArrayBufferLike>|null,text:vi.fn(),connection:null as Record<string,unknown>|null,rpc:vi.fn(),foreign:false}));
vi.mock('@/lib/ai/service',()=>({AIService:class{text=state.text;}}));
vi.mock('@/lib/supabase/server',()=>({adminClient:()=>database}));
const database={
  from:(table:string)=>{
    let update:Record<string,unknown>|undefined;
    let claim=false;
    const q:Record<string,unknown>={};
    q.select=q.eq=()=>q;
    q.is=(name:string)=>{if(name==='magic_used_at')claim=true;return q;};
    q.insert=q.update=(value:Record<string,unknown>)=>{update=value;return q;};
    const resolve=()=>{
      if(table==='agents')return {data:state.foreign?null:{id:'agent'},error:null};
      if(table==='social_connections')return {data:state.connection,error:null};
      if(claim&&state.row.magic_used_at)return {data:null,error:null};
      if(update)state.row={...state.row,...update};
      return {data:state.row,error:null};
    };
    q.single=q.maybeSingle=async()=>resolve();
    q.then=(accept:(v:unknown)=>void)=>accept(resolve());
    return q;
  },
  storage:{from:()=>({upload:async(_path:string,bytes:Uint8Array<ArrayBufferLike>)=>{state.stored=bytes;return {data:{},error:null};},remove:vi.fn()})},
  rpc:state.rpc,
};
import {uploadImport,finalizeImport} from '@/features/imports/service';
const ctx={db:database,user:{id:'user'},workspaceId:'workspace',role:'ADMIN'} as unknown as Parameters<typeof uploadImport>[0];
beforeEach(()=>{
  vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Network forbidden in unit test');}));
  state.row={id:'draft',agent_id:'agent',caption:'',magic_used_at:null,content_id:null};
  state.text.mockReset().mockResolvedValue({caption:'Legenda aprimorada'});state.rpc.mockReset();state.foreign=false;state.connection=null;
});
afterEach(()=>{expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();});
it('uploads original bytes and preserves aspect ratio without image AI',async()=>{
  const bytes=await sharp({create:{width:720,height:1280,channels:3,background:'blue'}}).jpeg().toBuffer();
  const row=await uploadImport(ctx,'agent',new File([new Uint8Array(bytes)],'input.jpg',{type:'image/jpeg'}));
  expect(Buffer.from(state.stored!).equals(bytes)).toBe(true);
  expect(row).toMatchObject({width:720,height:1280,mime_type:'image/jpeg'});
  expect(state.text).not.toHaveBeenCalled();
});
it('rejects non-image input and agents outside the workspace',async()=>{
  await expect(uploadImport(ctx,'agent',new File(['pdf'],'x.pdf',{type:'application/pdf'}))).rejects.toThrow('invalid_input');
  state.foreign=true;
  await expect(uploadImport(ctx,'foreign',new File(['data'],'x.jpg',{type:'image/jpeg'}))).rejects.toThrow('forbidden');
});
it.each(['publish','schedule'] as const)('blocks %s without a capable connected account',async action=>{
  await expect(finalizeImport(ctx,'draft',{action,caption:'Legenda',channel:'instagram'})).rejects.toThrow('official_integration_required');
  state.connection={id:'connection',channel:'instagram',metadata:{connected_via:'demo'}};
  await expect(finalizeImport(ctx,'draft',{action,caption:'Legenda',channel:'instagram',connection_id:'connection'})).rejects.toThrow('official_integration_required');
  expect(state.rpc).not.toHaveBeenCalled();
});
