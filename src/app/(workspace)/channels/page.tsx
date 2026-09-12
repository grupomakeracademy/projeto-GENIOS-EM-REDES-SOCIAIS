import { context, checked } from '@/lib/security/context';
import { adminClient } from '@/lib/supabase/server';
import { ChannelsView } from '@/features/channels/view';
import { channels, type Channel } from '@/lib/domain';

export default async function Page() {
  const ctx = await context('read');
  const rows = checked(
    await adminClient()
      .from('social_connections')
      .select('channel,account_name,external_id,created_at')
      .eq('workspace_id', ctx.workspaceId),
  );
  const initialConnections: Record<
    Channel,
    { connected: boolean; accountName?: string; connectedAt?: string }
  > = {
    instagram: { connected: false },
    facebook: { connected: false },
    whatsapp: { connected: false },
    tiktok: { connected: false },
    x: { connected: false },
    linkedin: { connected: false },
  };
  for (const row of rows || []) {
    if (row.channel in initialConnections) {
      initialConnections[row.channel as Channel] = {
        connected: true,
        accountName: row.account_name,
        connectedAt: row.created_at,
      };
    }
  }
  return <ChannelsView initialConnections={initialConnections} canEdit={ctx.role !== 'VIEWER'} />;
}
