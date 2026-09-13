import Link from 'next/link';
import { cookies } from 'next/headers';
import { context, checked } from '@/lib/security/context';
import { translate, type Locale } from '@/lib/i18n';
import { requireAgent } from '@/lib/security/agent';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; agent?: string }>;
}) {
  const ctx = await context(),
    q = ((await searchParams).q || '').replace(/[%_\\]/g, '').slice(0, 160),
    locale = ((await cookies()).get('locale')?.value || 'pt-BR') as Locale;
  const t = (k: string) => translate(locale, k);
  const agentId = await requireAgent(ctx, (await searchParams).agent);
  const [content, agents, assets] =
    q.length >= 2
      ? await Promise.all([
          ctx.db
            .from('content_items')
            .select('id,topic')
            .eq('workspace_id', ctx.workspaceId)
            .filter(agentId ? 'agent_id' : 'workspace_id', 'eq', agentId || ctx.workspaceId)
            .ilike('topic', `%${q}%`)
            .limit(20),
          ctx.db
            .from('agents')
            .select('id,name')
            .eq('workspace_id', ctx.workspaceId)
            .filter(agentId ? 'id' : 'workspace_id', 'eq', agentId || ctx.workspaceId)
            .ilike('name', `%${q}%`)
            .limit(20),
          ctx.db
            .from('assets')
            .select('id,name')
            .eq('workspace_id', ctx.workspaceId)
            .ilike('name', `%${q}%`)
            .limit(20),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
        ];
  return (
    <>
      <div className="page-heading">
        <h1>{t('search')}</h1>
        <p>{q}</p>
      </div>
      <div className="grid three">
        <section className="card">
          <h2>{t('contents')}</h2>
          {checked(content)?.map((c) => (
            <p key={c.id}>
              <Link href={`/contents/${c.id}`}>{c.topic}</Link>
            </p>
          ))}
        </section>
        <section className="card">
          <h2>{t('agents')}</h2>
          {checked(agents)?.map((a) => (
            <p key={a.id}>
              <Link href={`/agents?agent=${a.id}`}>{a.name}</Link>
            </p>
          ))}
        </section>
        <section className="card">
          <h2>{t('library')}</h2>
          {checked(assets)?.map((a) => (
            <p key={a.id}>
              <Link href="/library">{a.name}</Link>
            </p>
          ))}
        </section>
      </div>
    </>
  );
}
