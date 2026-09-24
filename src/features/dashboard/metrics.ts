import { inPeriod, statusDate, type DatedContent } from '@/features/calendar/dates';
export function dashboardCounts(items: DatedContent[], from: string, to: string) {
  return [items.filter(i => inPeriod(i.created_at,from,to)).length,
    ...['PUBLISHED','SCHEDULED','AWAITING_REVIEW'].map(status => items.filter(i =>
      (i.status === status || (status === 'AWAITING_REVIEW' && i.status === 'ROUTINE')) && inPeriod(statusDate(i),from,to)).length)];
}
