import 'server-only';
import { checked, type context } from '@/lib/security/context';
import type { Channel } from '@/lib/domain';
import { type DatedContent } from './dates';

export async function datedContents(ctx: Awaited<ReturnType<typeof context>>, agentId?: string | null, networks: Channel[] = []) {
  const rows: DatedContent[] = [];
  for (let offset = 0; ; offset += 500) {
    let q = ctx.db.from('content_items').select('id,topic,status,created_at,scheduled_at,content_events(event,created_at,metadata),content_variants(channel,published_at,content_publications(published_at))').eq('workspace_id', ctx.workspaceId).neq('status', 'ARCHIVED').order('id').range(offset, offset + 499);
    if (agentId) q = q.eq('agent_id', agentId);
    const batch = (checked(await q) || []) as DatedContent[];
    rows.push(...batch.filter(i => !networks.length || i.content_variants.some(v => networks.includes(v.channel))).map(i => ({ ...i, content_variants: i.content_variants.filter(v => !networks.length || networks.includes(v.channel)) })));
    if (batch.length < 500) return rows;
  }
}
