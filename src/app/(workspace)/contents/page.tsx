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
  const [result, agents, wsSettings] = await Promise.all([
    contentList(params),
    ctx.db.from('agents').select('*').eq('workspace_id', ctx.workspaceId).limit(100),
    ctx.db.from('workspace_settings').select('settings').eq('workspace_id', ctx.workspaceId).maybeSingle(),
  ]);
  const globalQ = (checked(wsSettings)?.settings as Record<string, string>)?.image_quality;
  const defaultImageQuality = globalQ === 'medium' ? 'medium' : 'low';
  return (
    <ContentList
      {...result}
      agents={checked(agents) as Agent[]}
      canEdit={ctx.role !== 'VIEWER'}
      defaultImageQuality={defaultImageQuality}
    />
  );
}
