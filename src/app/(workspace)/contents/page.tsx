import { contentList } from '@/features/content/queries';
import { context, checked } from '@/lib/security/context';
import { ContentList } from '@/features/content/list';
import type { Agent } from '@/lib/domain';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await context(),
    params = await searchParams;
  const [result, agents] = await Promise.all([
    contentList(params),
    ctx.db.from('agents').select('*').eq('workspace_id', ctx.workspaceId).limit(100),
  ]);
  return (
    <ContentList {...result} agents={checked(agents) as Agent[]} canEdit={ctx.role !== 'VIEWER'} />
  );
}
