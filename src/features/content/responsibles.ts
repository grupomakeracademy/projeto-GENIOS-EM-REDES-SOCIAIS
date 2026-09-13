import 'server-only';
import { adminClient } from '@/lib/supabase/server';
import { checked } from '@/lib/security/context';
export type ResponsiblePerson = { id: string; name: string; avatarUrl?: string };

export async function executionResponsibles(
  workspaceId: string,
  userIds: string[],
): Promise<Map<string, ResponsiblePerson>> {
  const ids = [...new Set(userIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
  if (!ids.length) return new Map();
  const db = adminClient();
  const members =
    checked(
      await db
        .from('workspace_members')
        .select('user_id')
        .eq('workspace_id', workspaceId)
        .in('user_id', ids),
    ) || [];
  if (!members.length) return new Map();
  const profiles =
    checked(
      await db
        .from('profiles')
        .select('id,name,onboarding_draft')
        .in(
          'id',
          members.map((m) => m.user_id),
        ),
    ) || [];
  return new Map(
    profiles
      .filter((p) => p.name)
      .map((p) => {
        const draft = (p.onboarding_draft as Record<string, unknown>) || {};
        const avatarUrl =
          typeof draft.avatar_url === 'string' && draft.avatar_url ? draft.avatar_url : undefined;
        return [p.id, { id: p.id, name: p.name, avatarUrl }];
      }),
  );
}
