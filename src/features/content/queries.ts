import { parseNetworks } from '@/lib/network-filter';
import 'server-only';
import { context, checked } from '@/lib/security/context';
import { channels, statuses, type Content } from '@/lib/domain';
import { requireAgent } from '@/lib/security/agent';
import { executionResponsibles } from './responsibles';
export async function contentList(params: Record<string, string | undefined> = {}) {
  const ctx = await context();
  const networks = parseNetworks(params.network);
  await requireAgent(ctx, params.agent);
  const page = Math.max(1, Math.min(10000, Number(params.page) || 1));
  let query = ctx.db
    .from('content_items')
    .select(
      networks.length
        ? '*,content_variants!inner(*,content_media(*))'
        : '*,content_variants(*,content_media(*))',
      { count: 'exact' },
    )
    .eq('workspace_id', ctx.workspaceId);
  const selectedStatuses = (params.status || '')
    .split(',')
    .filter((s) => statuses.includes(s as (typeof statuses)[number]));
  if (selectedStatuses.length) query = query.in('status', selectedStatuses);
  if (networks.length)
    query = query.in('content_variants.channel', networks);
  if (params.agent && /^[0-9a-f-]{36}$/i.test(params.agent))
    query = query.eq('agent_id', params.agent);
  if (params.q) query = query.ilike('topic', `%${params.q.replace(/[%_\\]/g, '').slice(0, 160)}%`);
  if (params.from && Number.isFinite(Date.parse(params.from)))
    query = query.gte('scheduled_at', new Date(params.from).toISOString());
  if (params.to && Number.isFinite(Date.parse(params.to)))
    query = query.lt('scheduled_at', new Date(params.to).toISOString());
  const ascending = params.sort === 'asc';
  const result = await query
    .order('created_at', { ascending })
    .range((page - 1) * 12, page * 12 - 1);
  const items = checked(result) as Content[];
  const jobs = items.length
    ? checked(
        await ctx.db
          .from('background_jobs')
          .select('id,payload')
          .eq('workspace_id', ctx.workspaceId)
          .in(
            'id',
            items.map((i) => i.id),
          ),
      ) || []
    : [];
  const creators = new Map(jobs.map((j) => [j.id, String(j.payload.created_by || '')]));
  const people = await executionResponsibles(
    ctx.workspaceId,
    items.map((i) => i.created_by || creators.get(i.id) || ''),
  );
  for (const item of items) {
    const person = people.get(item.created_by || creators.get(item.id) || '');
    item.responsibles = person ? [person] : [];
  }
  for (const item of items)
    for (const variant of item.content_variants)
      for (const media of variant.content_media) {
        const signed = await ctx.db.storage
          .from('brand-assets')
          .createSignedUrl(mediaDisplaySource(media.storage_path), 900);
        media.url = signed.data?.signedUrl;
      }
  return { items, total: result.count || 0, page, role: ctx.role };
}
import { mediaDisplaySource } from '@/lib/media-display-source';
