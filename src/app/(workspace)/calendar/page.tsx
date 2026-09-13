import { DateTime } from 'luxon';
import { Calendar, type CalendarContentItem } from '@/features/calendar/view';
import { context, checked, required } from '@/lib/security/context';
import { requireAgent } from '@/lib/security/agent';
import { AgentFilter } from '@/components/agent-filter';
import { statuses, channels } from '@/lib/domain';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; agent?: string; status?: string; network?: string }>;
}) {
  const ctx = await context(),
    workspace = required(
      await ctx.db.from('workspaces').select('timezone').eq('id', ctx.workspaceId).single(),
    ),
    params = await searchParams;
  const agentId = await requireAgent(ctx, params.agent);
  const agents =
    checked(await ctx.db.from('agents').select('id,name').eq('workspace_id', ctx.workspaceId)) ||
    [];
  const selectedStatuses = (params.status || '')
    .split(',')
    .filter((s) => statuses.includes(s as (typeof statuses)[number]));
  const network = params.network && params.network in channels ? params.network : null;
  const itemSelect = network
    ? 'id,topic,status,scheduled_at,created_at,content_variants!inner(channel)'
    : 'id,topic,status,scheduled_at,created_at,content_variants(channel)';
  const requested = DateTime.fromISO(params.date || '', { zone: workspace.timezone });
  const date = requested.isValid ? requested : DateTime.now().setZone(workspace.timezone);
  const from = date.startOf('month').minus({ days: 7 }).toUTC().toISO(),
    to = date.endOf('month').plus({ days: 7 }).toUTC().toISO();

  const [itemsResult, upcomingResult, fallbackRecentResult, monthCounts, variantsResult] =
    await Promise.all([
      ctx.db
        .from('content_items')
        .select(itemSelect)
        .eq('workspace_id', ctx.workspaceId)
        .filter(agentId ? 'agent_id' : 'workspace_id', 'eq', agentId || ctx.workspaceId)
        .in('status', selectedStatuses.length ? selectedStatuses : [...statuses])
        .filter(
          network ? 'content_variants.channel' : 'workspace_id',
          'eq',
          network || ctx.workspaceId,
        )
        .gte('scheduled_at', from)
        .lte('scheduled_at', to)
        .neq('status', 'ARCHIVED')
        .order('scheduled_at')
        .limit(500),
      ctx.db
        .from('content_items')
        .select(itemSelect)
        .eq('workspace_id', ctx.workspaceId)
        .filter(agentId ? 'agent_id' : 'workspace_id', 'eq', agentId || ctx.workspaceId)
        .in('status', selectedStatuses.length ? selectedStatuses : [...statuses])
        .filter(
          network ? 'content_variants.channel' : 'workspace_id',
          'eq',
          network || ctx.workspaceId,
        )
        .gte('scheduled_at', DateTime.now().setZone(workspace.timezone).toUTC().toISO())
        .neq('status', 'ARCHIVED')
        .order('scheduled_at', { ascending: true })
        .limit(6),
      ctx.db
        .from('content_items')
        .select(itemSelect)
        .eq('workspace_id', ctx.workspaceId)
        .filter(agentId ? 'agent_id' : 'workspace_id', 'eq', agentId || ctx.workspaceId)
        .in('status', selectedStatuses.length ? selectedStatuses : [...statuses])
        .filter(
          network ? 'content_variants.channel' : 'workspace_id',
          'eq',
          network || ctx.workspaceId,
        )
        .neq('status', 'ARCHIVED')
        .order('created_at', { ascending: false })
        .limit(6),
      Promise.all(
        ['PUBLISHED', 'SCHEDULED', 'APPROVED', 'AWAITING_REVIEW', 'DRAFT', 'REJECTED'].map((s) => {
          let countQuery = ctx.db
            .from('content_items')
            .select(network ? 'id,content_variants!inner(channel)' : 'id', {
              count: 'exact',
              head: true,
            })
            .eq('workspace_id', ctx.workspaceId)
            .filter(agentId ? 'agent_id' : 'workspace_id', 'eq', agentId || ctx.workspaceId)
            .filter(
              network ? 'content_variants.channel' : 'workspace_id',
              'eq',
              network || ctx.workspaceId,
            )
            .in('status', selectedStatuses.length ? selectedStatuses : [...statuses])
            .eq('status', s);
          if (s === 'SCHEDULED' || s === 'PUBLISHED') {
            countQuery = countQuery
              .gte('scheduled_at', date.startOf('month').toUTC().toISO())
              .lte('scheduled_at', date.endOf('month').toUTC().toISO());
          } else {
            countQuery = countQuery
              .gte('created_at', date.startOf('month').toUTC().toISO())
              .lte('created_at', date.endOf('month').toUTC().toISO());
          }
          return countQuery;
        }),
      ),
      ctx.db
        .from('content_variants')
        .select('channel,content_items!inner(agent_id,status)')
        .eq('workspace_id', ctx.workspaceId)
        .filter(
          agentId ? 'content_items.agent_id' : 'workspace_id',
          'eq',
          agentId || ctx.workspaceId,
        )
        .neq('content_items.status', 'ARCHIVED')
        .filter(network ? 'channel' : 'workspace_id', 'eq', network || ctx.workspaceId),
    ]);

  const items = checked(itemsResult) || [];
  const upcomingDirect = checked(upcomingResult) || [];
  const fallbackRecent = checked(fallbackRecentResult) || [];
  const upcoming = upcomingDirect.length ? upcomingDirect : fallbackRecent;

  const distribution: Record<string, number> = {
    instagram: 0,
    facebook: 0,
    whatsapp: 0,
    tiktok: 0,
    x: 0,
    linkedin: 0,
  };
  const variants = checked(variantsResult) || [];
  for (const v of variants) {
    if (v.channel in distribution) {
      distribution[v.channel]++;
    }
  }

  const summary = {
    published: monthCounts[0]?.count || 0,
    scheduled: monthCounts[1]?.count || 0,
    approved: monthCounts[2]?.count || 0,
    review: monthCounts[3]?.count || 0,
    draft: monthCounts[4]?.count || 0,
    rejected: monthCounts[5]?.count || 0,
  };

  return (
    <>
      <div className="toolbar">
        <AgentFilter agents={agents} />
      </div>
      <Calendar
        items={items as unknown as CalendarContentItem[]}
        upcoming={upcoming as unknown as CalendarContentItem[]}
        summary={summary}
        distribution={distribution}
        timezone={workspace.timezone}
        date={date.toISODate()!}
      />
    </>
  );
}
