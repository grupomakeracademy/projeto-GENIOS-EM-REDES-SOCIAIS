import { accountStorage } from '@/lib/account-storage';
import { context, checked } from '@/lib/security/context';
import { Library } from '@/features/library/view';
import type { Asset } from '@/lib/domain';
import { isSuperAdmin } from '@/lib/security/super-admin';
import { adminClient } from '@/lib/supabase/server';

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
  const isSuper = isSuperAdmin(ctx.user);

  let agents: Array<{ id: string; name: string; visual_settings: Record<string, unknown> }> = [];
  if (isSuper) {
    const res = await adminClient()
      .from('agents')
      .select('id,name,visual_settings')
      .order('name');
    agents = (res.data || []) as any;
  } else {
    const { data: memberWorkspaces } = await ctx.db
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', ctx.user.id);
    const wsIds = (memberWorkspaces || []).map((m) => m.workspace_id);
    const res = await adminClient()
      .from('agents')
      .select('id,name,visual_settings')
      .in('workspace_id', wsIds.length ? wsIds : [ctx.workspaceId])
      .order('name');
    agents = (res.data || []) as any;
  }

  await Promise.all(
    items.map(async (asset) => {
      if (asset.storage_path) {
        const res = await ctx.db.storage.from('brand-assets').createSignedUrl(asset.storage_path, 900);
        asset.url = res.data?.signedUrl;
      }
    }),
  );

  const {usedBytes:userUsedBytes,quotaMB:userQuotaMB} = await accountStorage(ctx.user);

  return (
    <Library
      agents={agents}
      items={items}
      page={page}
      total={result.count || 0}
      canEdit={ctx.role !== 'VIEWER'}
      canAdmin={ctx.role === 'ADMIN'}
      isSuperAdmin={isSuper}
      userUsedBytes={userUsedBytes}
      userQuotaMB={userQuotaMB}
    />
  );
}
