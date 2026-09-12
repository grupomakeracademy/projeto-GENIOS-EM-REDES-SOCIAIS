import { z } from 'zod';
import { channelSchema, channels, type Channel } from '@/lib/domain';
import { guard, checked, fail } from '@/lib/security/context';
import { adminClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const ctx = await guard(request, 'read');
    const rows = checked(
      await adminClient()
        .from('social_connections')
        .select('channel,account_name,external_id,created_at')
        .eq('workspace_id', ctx.workspaceId),
    );
    const connections: Record<string, { connected: boolean; accountName?: string; connectedAt?: string }> = {};
    for (const ch of Object.keys(channels)) {
      const found = rows?.find((r: { channel: string }) => r.channel === ch);
      connections[ch] = found
        ? { connected: true, accountName: found.account_name, connectedAt: found.created_at }
        : { connected: false };
    }
    return Response.json({ connections }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await guard(request, 'write');
    const body = z
      .object({
        channel: channelSchema,
        action: z.enum(['connect', 'disconnect']).default('connect'),
        account_name: z.string().trim().max(160).optional(),
        token: z.string().trim().max(2000).optional(),
      })
      .parse(await request.json());

    if (body.action === 'disconnect') {
      checked(
        await adminClient()
          .from('social_connections')
          .delete()
          .eq('workspace_id', ctx.workspaceId)
          .eq('channel', body.channel),
      );
      return Response.json({ success: true, connected: false, channel: body.channel });
    }

    const accountName = body.account_name || `@${body.channel}_oficial`;
    checked(
      await adminClient()
        .from('social_connections')
        .upsert(
          {
            workspace_id: ctx.workspaceId,
            channel: body.channel,
            account_name: accountName,
            external_id: crypto.randomUUID(),
            token_ciphertext: body.token || 'demo_connected',
            metadata: { connected_via: body.token ? 'manual_token' : 'demo' },
            created_at: new Date().toISOString(),
          },
          { onConflict: 'workspace_id,channel' },
        ),
    );

    return Response.json({
      success: true,
      connected: true,
      channel: body.channel,
      accountName,
    });
  } catch (e) {
    return fail(e);
  }
}
