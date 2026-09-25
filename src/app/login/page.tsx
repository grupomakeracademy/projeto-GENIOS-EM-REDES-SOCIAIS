import { configured } from '@/lib/supabase/server';
import { AuthForm } from '@/features/auth/form';

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthForm
      configured={configured()}
      initialMode={params.mode || 'login'}
      initialError={params.error}
    />
  );
}
