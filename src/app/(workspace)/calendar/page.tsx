import { DateTime } from 'luxon';
import { Calendar } from '@/features/calendar/view';
import { context, checked, required } from '@/lib/security/context';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const ctx = await context(),
    workspace = required(
      await ctx.db.from('workspaces').select('timezone').eq('id', ctx.workspaceId).single(),
    ),
    params = await searchParams;
  const requested = DateTime.fromISO(params.date || '', { zone: workspace.timezone });
  const date = requested.isValid ? requested : DateTime.now().setZone(workspace.timezone);
  const from = date.startOf('month').minus({ days: 7 }).toUTC().toISO(),
    to = date.endOf('month').plus({ days: 7 }).toUTC().toISO();

  const [itemsResult, upcomingResult, fallbackRecentResult, monthCounts, variantsResult] =
    await Promise.all([
      ctx.db
        .from('content_items')
        .select('id,topic,status,scheduled_at,created_at,content_variants(channel)')
        .eq('workspace_id', ctx.workspaceId)
        .gte('scheduled_at', from)
        .lte('scheduled_at', to)
        .neq('status', 'ARCHIVED')
        .order('scheduled_at')
        .limit(500),
      ctx.db
        .from('content_items')
        .select('id,topic,status,scheduled_at,created_at,content_variants(channel)')
        .eq('workspace_id', ctx.workspaceId)
        .gte('scheduled_at', DateTime.now().setZone(workspace.timezone).toUTC().toISO())
        .neq('status', 'ARCHIVED')
        .order('scheduled_at', { ascending: true })
        .limit(6),
      ctx.db
        .from('content_items')
        .select('id,topic,status,scheduled_at,created_at,content_variants(channel)')
        .eq('workspace_id', ctx.workspaceId)
        .neq('status', 'ARCHIVED')
        .order('created_at', { ascending: false })
        .limit(6),
      Promise.all(
        ['SCHEDULED', 'PUBLISHED', 'AWAITING_REVIEW', 'DRAFT'].map((s) =>
          ctx.db
            .from('content_items')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', ctx.workspaceId)
            .eq('status', s),
        ),
      ),
      ctx.db
        .from('content_variants')
        .select('channel')
        .eq('workspace_id', ctx.workspaceId),
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
    scheduled: monthCounts[0]?.count || 0,
    published: monthCounts[1]?.count || 0,
    review: monthCounts[2]?.count || 0,
    draft: monthCounts[3]?.count || 0,
  };

  return (
    <Calendar
      items={items as any}
      upcoming={upcoming as any}
      summary={summary}
      distribution={distribution}
      timezone={workspace.timezone}
      date={date.toISODate()!}
    />
  );
}
