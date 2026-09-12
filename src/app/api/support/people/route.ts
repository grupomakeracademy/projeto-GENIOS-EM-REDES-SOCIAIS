import { guard, checked, fail } from '@/lib/security/context';
import { adminClient } from '@/lib/supabase/server';
export async function GET(request: Request) {
  try {
    const ctx = await guard(request, 'admin');
    const members =
      checked(
        await ctx.db
          .from('workspace_members')
          .select('user_id,role')
          .eq('workspace_id', ctx.workspaceId),
      ) ?? [];
    const profiles =
      checked(
        await adminClient()
          .from('profiles')
          .select('id,name')
          .in(
            'id',
            members.map((m) => m.user_id),
          ),
      ) ?? [];
    return Response.json(
      {
        items: members.map((m) => ({
          ...m,
          name: profiles.find((p) => p.id === m.user_id)?.name || 'Usuário',
        })),
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return fail(e);
  }
}
