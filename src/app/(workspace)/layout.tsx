import { redirect } from 'next/navigation';
import { configured } from '@/lib/supabase/server';
import { context, AppError } from '@/lib/security/context';
import { Shell } from '@/components/shell';
export const dynamic = 'force-dynamic';
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  if (!configured()) redirect('/login');
  let ctx;
  try {
    ctx = await context();
  } catch (e) {
    if (e instanceof AppError && e.code === 'onboarding_required') redirect('/onboarding');
    redirect('/login');
  }
  const [{ data }, { data: profile }] = await Promise.all([
    ctx.db.from('workspaces').select('name').eq('id', ctx.workspaceId).single(),
    ctx.db.from('profiles').select('name,onboarding_draft').eq('id', ctx.user.id).maybeSingle(),
  ]);
  const avatarUrl =
    (profile?.onboarding_draft as Record<string, string>)?.avatar_url ||
    (ctx.user.user_metadata?.avatar_url as string) ||
    '';
  return (
    <Shell
      name={data?.name || 'Workspace'}
      userName={profile?.name || ''}
      avatarUrl={avatarUrl}
      role={ctx.role}
    >
      {children}
    </Shell>
  );
}
