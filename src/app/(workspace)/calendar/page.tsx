import { DateTime } from 'luxon';
import { Calendar } from '@/features/calendar/view';
import { context, checked, required } from '@/lib/security/context';
import { requireAgent } from '@/lib/security/agent';
import { AgentFilter } from '@/components/agent-filter';
import { parseNetworks } from '@/lib/network-filter';
import { datedContents } from '@/features/calendar/data';
import { statusDate, inPeriod, isUpcoming, monthSummary } from '@/features/calendar/dates';
export default async function Page({ searchParams }: { searchParams: Promise<{ date?: string; agent?: string; status?: string; network?: string }> }) {
 const ctx = await context(), params = await searchParams;
 const workspace = required(await ctx.db.from('workspaces').select('timezone').eq('id',ctx.workspaceId).single());
 const agentId = await requireAgent(ctx, params.agent);
 const agents = checked(await ctx.db.from('agents').select('id,name').eq('workspace_id',ctx.workspaceId)) || [];
 const requested = DateTime.fromISO(params.date || '', {zone:workspace.timezone});
 const date = requested.isValid ? requested : DateTime.now().setZone(workspace.timezone);
 const selected = (params.status || '').split(',').filter(Boolean);
 const all = (await datedContents(ctx,agentId,parseNetworks(params.network))).filter(i=>!selected.length || selected.includes(i.status)).map(i=>({...i,event_at:statusDate(i)}));
 const start = date.startOf('month'), end = start.plus({months:1});
 const month = all.filter(i=>inPeriod(i.event_at,start.toISO()!,end.toISO()!));
 const gridStart = start.minus({days:start.weekday%7});
 const items = all.filter(i=>inPeriod(i.event_at,gridStart.toISO()!,gridStart.plus({days:42}).toISO()!));
 const upcoming = all.filter(isUpcoming).sort((a,b)=>(Date.parse(a.scheduled_at || a.event_at || '') || 0)-(Date.parse(b.scheduled_at || b.event_at || '') || 0)).slice(0,6);
 const summary = monthSummary(all,start.toISO()!,end.toISO()!);
 const distribution:Record<string,number>={};
 for(const item of month) for(const variant of item.content_variants) distribution[variant.channel]=(distribution[variant.channel] || 0)+1;
 return <><div className="toolbar"><AgentFilter agents={agents}/></div><Calendar items={items} upcoming={upcoming} summary={summary} distribution={distribution} timezone={workspace.timezone} date={date.toISODate()!}/></>;
}