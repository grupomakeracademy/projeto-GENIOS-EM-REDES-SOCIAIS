import { beforeEach, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const state = vi.hoisted(() => ({ asset: {} as Record<string, unknown>, writes: [] as Record<string, unknown>[], failSave: false, download: vi.fn(), provider: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ adminClient: () => ({
  storage: { from: () => ({ download: state.download }) },
  from: () => {
    let update: Record<string, unknown> | undefined;
    const q = {
      select: () => q, eq: () => q,
      update: (value: Record<string, unknown>) => { update = value; state.writes.push(value); return q; },
      maybeSingle: async () => ({ data: state.asset, error: null }),
      then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: null, error: state.failSave && update?.processing_status === 'processed' ? { code: '23514' } : null }).then(resolve),
    }; return q;
  },
}) }));
vi.mock('@/lib/ai/credentials', () => ({ serverCredential: () => 'test-secret' }));
vi.mock('@/lib/ai/providers', () => ({ apiJSON: state.provider, openAISchema: () => ({}) }));
import { processAssetKnowledge, visualReferenceInterpretationSchema } from '@/lib/ai/asset-knowledge';
import { ProviderError } from '@/lib/ai/provider-error';
import { assetProcessingMessage } from '@/lib/ai/asset-processing-errors';

beforeEach(() => {
  vi.clearAllMocks(); state.writes = []; state.failSave = false;
  state.asset = { id: 'asset', workspace_id: 'workspace', category: 'reference', name: 'photo.jpg', mime_type: 'image/jpeg', storage_path: 'original.jpg' };
  state.download.mockResolvedValue({ data: new Blob(['image']), error: null });
  const interpretation = Object.fromEntries(Object.keys(visualReferenceInterpretationSchema.shape).map(key => [key, ['predominant_colors','mandatory_elements','elements_to_avoid'].includes(key) ? ['Azul'] : key === 'reference_type' ? 'general_reference' : 'Descrição visual']));
  state.provider.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(interpretation) } }] });
});
it('downloads, sends original bytes, parses and persists the real service result', async () => {
  const result = await processAssetKnowledge('asset', {force: true});
  expect(result.status).toBe('processed');
  expect(state.download).toHaveBeenCalledWith('original.jpg');
  expect(state.provider.mock.calls[0][2].messages[1].content[1].image_url.url).toBe('data:image/jpeg;base64,aW1hZ2U=');
  expect(state.writes.at(-1)).toMatchObject({processing_status:'processed', processing_error:null, summary_text: expect.stringContaining('DNA VISUAL'), processed_at: expect.any(String)});
});
it('reports the diagnosed invalid credential without claiming success', async () => {
  state.provider.mockRejectedValue(new ProviderError('authentication_error',{provider:'openai',operation:'/v1/chat/completions',status:401,code:'invalid_api_key'}));
  const result = await processAssetKnowledge('asset',{force:true});
  expect(result.status).toBe('failed'); expect(result.error).toBe('authentication_error');
  expect(state.writes.at(-1)).toMatchObject({processing_status:'failed',processing_error:'authentication_error'});
  expect(assetProcessingMessage(result.error)).toContain('credencial');
});
it('does not report processed when persistence fails',async()=>{
  state.failSave=true;
  expect(await processAssetKnowledge('asset',{force:true})).toMatchObject({status:'failed',error:'asset_persistence_failed'});
});
it('handles invalid model output and download errors',async()=>{
  state.provider.mockResolvedValue({choices:[{message:{content:'invalid json'}}]});
  expect(await processAssetKnowledge('asset',{force:true})).toMatchObject({status:'failed',error:'invalid_output'});
  state.download.mockResolvedValue({data:null,error:{message:'private storage detail'}});
  expect(await processAssetKnowledge('asset',{force:true})).toMatchObject({status:'failed',error:'storage_download_failed'});
});
it.each(['protected_identity','exact_asset'])('preserves direct-file category %s without Storage or AI requests',async category=>{
  state.asset.category=category;
  expect(await processAssetKnowledge('asset',{force:true})).toMatchObject({status:'already_processed',visionCallsMade:0});
  expect(state.provider).not.toHaveBeenCalled();expect(state.download).not.toHaveBeenCalled();
});
it('never returns unknown internal errors as a user-facing message',()=>{
  expect(assetProcessingMessage('sk-secret')).not.toContain('sk-secret');
});
