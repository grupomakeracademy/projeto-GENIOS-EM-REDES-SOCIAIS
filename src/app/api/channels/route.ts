import { connectionCapabilities } from '@/lib/social/connection-capabilities';
import type { Channel } from '@/lib/domain';
import { z } from 'zod';
import { channelSchema, channels } from '@/lib/domain';
import { guard, checked, fail, AppError } from '@/lib/security/context';
import { requireAgent } from '@/lib/security/agent';
import { adminClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/security/crypto';

export async function GET(request: Request) {
  try {
    const ctx = await guard(request, 'read');
    const agentId = await requireAgent(ctx, new URL(request.url).searchParams.get('agent'));
    const rows = checked(
      await adminClient()
        .from('social_connections')
        .select('id,agent_id,channel,account_name,external_id,created_at,metadata')
        .eq('workspace_id', ctx.workspaceId)
        .filter(agentId ? 'agent_id' : 'workspace_id', 'eq', agentId || ctx.workspaceId),
    );
    const connections: Record<
      string,
      { connected: boolean; accountName?: string; connectedAt?: string; externalId?: string }
    > = {};
    for (const ch of Object.keys(channels)) {
      const found = rows?.find((r: { channel: string }) => r.channel === ch);
      connections[ch] = found
        ? { connected: true, accountName: found.account_name, connectedAt: found.created_at, externalId: found.external_id }
        : { connected: false };
    }
    return Response.json(
      { connections: agentId ? connections : {}, items: rows?.map(({metadata,...r}) => ({...r,capabilities:connectionCapabilities(r.channel as Channel,metadata)})) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
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
        agent_id: z.uuid(),
        connection_id: z.uuid().optional(),
        action: z.enum(['connect', 'disconnect', 'assign']).default('connect'),
        account_name: z.string().trim().max(160).optional(),
        token: z.string().trim().max(2000).optional(),
        external_id: z.string().trim().max(160).optional(),
      })
      .parse(await request.json());
    await requireAgent(ctx, body.agent_id);
    if (body.action === 'assign') {
      if (!body.connection_id) throw new AppError('invalid_input');
      const assigned = checked(
        await adminClient()
          .from('social_connections')
          .update({ agent_id: body.agent_id })
          .eq('id', body.connection_id)
          .eq('workspace_id', ctx.workspaceId)
          .is('agent_id', null)
          .select('id')
          .maybeSingle(),
      );
      if (!assigned) throw new AppError('conflict', 409);
      return Response.json({ success: true });
    }

    if (body.action === 'disconnect') {
      checked(
        await adminClient()
          .from('social_connections')
          .delete()
          .eq('workspace_id', ctx.workspaceId)
          .eq('agent_id', body.agent_id)
          .eq('channel', body.channel),
      );
      return Response.json({ success: true, connected: false, channel: body.channel });
    }

    const accountName = body.account_name || `@${body.channel}_oficial`;
    const externalId = body.external_id || crypto.randomUUID();

    let tokenCiphertext = body.token || 'demo_connected';
    if (body.token) {
      try {
        tokenCiphertext = encrypt(body.token, ctx.workspaceId);
      } catch {
        // Fallback se CREDENTIAL_MASTER_KEY não estiver configurada no ambiente local
        tokenCiphertext = body.token;
      }
    }

    checked(
      await adminClient()
        .from('social_connections')
        .upsert(
          {
            workspace_id: ctx.workspaceId,
            agent_id: body.agent_id,
            channel: body.channel,
            account_name: accountName,
            external_id: externalId,
            token_ciphertext: tokenCiphertext,
            metadata: {
              connected_via: body.token ? 'manual_token' : 'demo',
              external_id: body.external_id || null,
            },
            created_at: new Date().toISOString(),
          },
          { onConflict: 'workspace_id,agent_id,channel' },
        ),
    );

    return Response.json({
      success: true,
      connected: true,
      channel: body.channel,
      accountName,
      externalId,
    });
  } catch (e) {
    return fail(e);
  }
}
