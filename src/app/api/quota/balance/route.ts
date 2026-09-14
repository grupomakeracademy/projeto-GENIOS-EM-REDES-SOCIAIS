import { guard, fail } from '@/lib/security/context';

export async function GET(request: Request) {
  try {
    const ctx = await guard(request, 'read');
    const { data: profile, error } = await ctx.db
      .from('profiles')
      .select('content_quota_balance, content_quota_total_assigned, content_quota_total_consumed')
      .eq('id', ctx.user.id)
      .maybeSingle();

    if (error || !profile) {
      return Response.json(
        {
          balance: 100,
          total_assigned: 100,
          total_consumed: 0,
        },
        { headers: { 'Cache-Control': 'private, no-cache, no-store' } },
      );
    }

    return Response.json(
      {
        balance: profile.content_quota_balance ?? 100,
        total_assigned: profile.content_quota_total_assigned ?? 100,
        total_consumed: profile.content_quota_total_consumed ?? 0,
      },
      { headers: { 'Cache-Control': 'private, no-cache, no-store' } },
    );
  } catch (e) {
    return fail(e);
  }
}
