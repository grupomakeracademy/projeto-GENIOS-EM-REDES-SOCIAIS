import { dashboardCounts } from '@/features/dashboard/metrics';
import { DateTime } from 'luxon';
import { context, checked, required } from '@/lib/security/context';
import { requireAgent } from '@/lib/security/agent';
import { AgentFilter } from '@/components/agent-filter';
import { NetworkFilter } from '@/components/network-filter';
import { workspaceNetworks } from '@/lib/applicable-networks';
import { parseNetworks } from '@/lib/network-filter';
import { datedContents } from '@/features/calendar/data';
import { statusDate, inPeriod } from '@/features/calendar/dates';
import { PeriodFilter } from '@/features/dashboard/period-filter';
import { Dashboard } from '@/features/dashboard/view';
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
 const ctx = await context(), params = await searchParams, agentId = await requireAgent(ctx, params.agent);
 const workspace = required(await ctx.db.from('workspaces').select('name,timezone').eq('id',ctx.workspaceId).single());
 const networks = parseNetworks(params.network);
 const now = DateTime.now().setZone(workspace.timezone);
 const start = DateTime.fromISO(params.from || '', { zone: workspace.timezone });
 const end = DateTime.fromISO(params.to || '', { zone: workspace.timezone });
 const from = (start.isValid ? start : now.startOf('month')).startOf('day');
 const to = (end.isValid && end >= from ? end : from.endOf('month')).startOf('day').plus({ days: 1 });
 const [items, available, agentResult] = await Promise.all([
 datedContents(ctx, agentId, networks), workspaceNetworks(ctx),
 ctx.db.from('agents').select('id,name,active,channels').eq('workspace_id',ctx.workspaceId),
 ]);
 const agents = checked(agentResult) || [];
 const within = (d: string | null) => inPeriod(d, from.toISO()!, to.toISO()!);
 const counts = dashboardCounts(items,from.toISO()!,to.toISO()!);
 const relevant = items.filter(i => within(statusDate(i)));
 return <><div className="toolbar"><AgentFilter agents={agents} /><NetworkFilter available={available} /></div>
 <PeriodFilter todayISO={now.toISODate()!} key={from.toISO()!+to.toISO()!} from={from.toISODate()!} to={to.minus({ days: 1 }).toISODate()!} />
 <Dashboard name={agentId ? agents.find(a=>a.id===agentId)!.name : workspace.name} counts={counts}
 recent={relevant.sort((a,b)=>Date.parse(statusDate(b)!)-Date.parse(statusDate(a)!)).slice(0,5)}
 upcoming={relevant.filter(i=>i.status==='SCHEDULED' && Date.parse(i.scheduled_at!)>=now.toMillis()).sort((a,b)=>Date.parse(a.scheduled_at!)-Date.parse(b.scheduled_at!)).slice(0,5)}
 agentId={agentId || ''} agents={agents.filter(a=>a.active && (!agentId || a.id===agentId) && (!networks.length || (a.channels || []).some((c:string)=>networks.some(n=>n===c)))).length} runs={[]} />
 </>;
}
