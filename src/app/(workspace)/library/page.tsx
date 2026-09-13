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

  const [userAssetsResult, profileResult] = await Promise.all([
    ctx.db.from('assets').select('size').eq('created_by', ctx.user.id),
    ctx.db.from('profiles').select('storage_quota_mb').eq('id', ctx.user.id).maybeSingle(),
  ]);
  const userUsedBytes = (userAssetsResult.data || []).reduce((acc, a) => acc + (a.size || 0), 0);
  const userQuotaMB = profileResult.data?.storage_quota_mb ?? 100;

  return (
    <Library
      agents={agents}
      items={items}
      page={page}
      total={result.count || 0}
      canEdit={ctx.role !== 'VIEWER'}
      canAdmin={ctx.role === 'ADMIN'}
      userUsedBytes={userUsedBytes}
      userQuotaMB={userQuotaMB}
    />
  );
}
