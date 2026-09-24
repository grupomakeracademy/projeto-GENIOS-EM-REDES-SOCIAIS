import type { Channel } from '@/lib/domain';

export type DatedContent = {
  id: string; topic: string; status: string; created_at: string; scheduled_at: string | null;
  content_events: { event: string; created_at: string; metadata?: Record<string, unknown> }[];
  content_variants: { channel: Channel; published_at?: string | null; content_publications?: { published_at: string | null }[] }[];
};
export function statusDate(item: DatedContent): string | null {
  const latest = (dates: (string | null | undefined)[]) => dates.filter((d): d is string => !!d && Number.isFinite(Date.parse(d))).sort((a,b) => Date.parse(b)-Date.parse(a))[0] || null;
  if (item.status === 'SCHEDULED') return item.scheduled_at;
  if (item.status === 'PUBLISHED') return latest(item.content_variants.flatMap(v => [v.published_at, ...(v.content_publications || []).map(p => p.published_at)])) || latest(item.content_events.filter(e => ['PUBLISHED', 'PUBLISH'].includes(e.event)).map(e => e.created_at));
  return latest(item.content_events.filter(e => e.event === item.status || (e.event === 'CREATED' && e.metadata?.status === item.status)).map(e => e.created_at)) || (item.status === 'DRAFT' ? item.created_at : null);
}
export function isUpcoming(item: Pick<DatedContent, 'status'>) {
  return ['DRAFT','ROUTINE','GENERATING','AWAITING_REVIEW','APPROVED','SCHEDULED'].includes(item.status);
}
export function inPeriod(date: string | null, from: string, to: string) {
  return !!date && Date.parse(date) >= Date.parse(from) && Date.parse(date) < Date.parse(to);
}

export function monthSummary(items: DatedContent[], from: string, to: string) {
  const month = items.filter(i => inPeriod(statusDate(i),from,to));
  const count = (...states: string[]) => month.filter(i => states.includes(i.status)).length;
  return { published:count('PUBLISHED'),scheduled:count('SCHEDULED'),approved:count('APPROVED'),review:count('AWAITING_REVIEW','ROUTINE'),draft:count('DRAFT'),rejected:count('REJECTED') };
}
