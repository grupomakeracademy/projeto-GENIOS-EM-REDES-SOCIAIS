import { guard, checked, fail } from '@/lib/security/context';
export async function GET(request: Request) {
  try {
    const ctx = await guard(request);
    return Response.json({
      items: checked(
        await ctx.db
          .from('notifications')
          .select('id,message,href')
          .eq('workspace_id', ctx.workspaceId)
          .order('created_at', { ascending: false })
          .limit(30),
      ),
    });
  } catch (e) {
    return fail(e);
  }
}
