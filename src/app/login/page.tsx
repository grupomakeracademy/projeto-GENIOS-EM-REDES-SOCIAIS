import { configured } from '@/lib/supabase/server';
import { AuthForm } from '@/features/auth/form';
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  return <AuthForm configured={configured()} initialMode={(await searchParams).mode || 'login'} />;
}
