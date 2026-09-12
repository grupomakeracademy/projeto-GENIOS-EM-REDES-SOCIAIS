import 'server-only';
import { context, checked } from '@/lib/security/context';
import { statuses, type Content } from '@/lib/domain';
export async function contentList(params: Record<string, string | undefined> = {}) {
  const ctx = await context();
  const page = Math.max(1, Math.min(10000, Number(params.page) || 1));
  let query = ctx.db
    .from('content_items')
    .select('*,content_variants(*,content_media(*))', { count: 'exact' })
    .eq('workspace_id', ctx.workspaceId);
  if (params.status && statuses.includes(params.status as (typeof statuses)[number]))
    query = query.eq('status', params.status);
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
  for (const item of items)
    for (const variant of item.content_variants)
      for (const media of variant.content_media) {
        const signed = await ctx.db.storage
          .from('brand-assets')
          .createSignedUrl(media.storage_path, 900);
        media.url = signed.data?.signedUrl;
      }
  return { items, total: result.count || 0, page, role: ctx.role };
}
