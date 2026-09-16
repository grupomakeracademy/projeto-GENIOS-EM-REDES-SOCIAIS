import {context,checked} from '@/lib/security/context';
import {ImportView} from '@/features/imports/view';
import {connectors} from '@/lib/social/connectors';
export default async function Page(){
  const ctx=await context();
  const agents=checked(await ctx.db.from('agents').select('id,name').eq('workspace_id',ctx.workspaceId).order('name'));
  return <ImportView agents={agents||[]} canEdit={ctx.role!=='VIEWER'} capabilities={Object.fromEntries(Object.entries(connectors).map(([key,value])=>[key,value.capabilities()]))}/>;
}
