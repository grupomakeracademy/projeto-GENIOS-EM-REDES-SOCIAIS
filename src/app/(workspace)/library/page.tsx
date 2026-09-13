import { context, checked } from '@/lib/security/context';
import { Library } from '@/features/library/view';
import type { Asset } from '@/lib/domain';
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const ctx = await context(),
    page = Math.max(1, Number((await searchParams).page) || 1);
  const result = await ctx.db
    .from('assets')
    .select('*', { count: 'exact' })
    .eq('workspace_id', ctx.workspaceId)
    .order('created_at', { ascending: false })
    .range((page - 1) * 24, page * 24 - 1);
  const items = checked(result) as Asset[];
  const agents =
    checked(
      await ctx.db
        .from('agents')
        .select('id,name,visual_settings')
        .eq('workspace_id', ctx.workspaceId),
    ) || [];
  for (const asset of items)
    asset.url = (await ctx.db.storage.from('brand-assets').createSignedUrl(asset.storage_path, 900))
      .data?.signedUrl;
  return (
    <Library
      agents={agents}
      items={items}
      page={page}
      total={result.count || 0}
      canEdit={ctx.role !== 'VIEWER'}
    />
  );
}
