import { redirect } from 'next/navigation';
import { sessionClient, configured } from '@/lib/supabase/server';
import { Onboarding } from '@/features/agents/onboarding';
export default async function Page() {
  if (!configured()) redirect('/login');
  const db = await sessionClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { data: members } = await db
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1);
  if (members?.length) redirect('/dashboard');
  const { data } = await db
    .from('profiles')
    .select('onboarding_draft')
    .eq('id', user.id)
    .maybeSingle();
  return <Onboarding initial={data?.onboarding_draft || {}} />;
}
