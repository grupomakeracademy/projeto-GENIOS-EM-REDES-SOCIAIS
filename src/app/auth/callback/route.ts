import { NextResponse } from 'next/server';
import { sessionClient } from '@/lib/supabase/server';
export async function GET(request: Request) {
  const url = new URL(request.url),
    code = url.searchParams.get('code');
  const next =
    url.searchParams.get('next') === '/login?mode=reset' ? '/login?mode=reset' : '/dashboard';
  if (code) {
    const db = await sessionClient();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, process.env.APP_ORIGIN!));
  }
  return NextResponse.redirect(new URL('/login', process.env.APP_ORIGIN!));
}
