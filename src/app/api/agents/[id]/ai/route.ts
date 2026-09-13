import { z } from 'zod';
import { guard, checked, fail, AppError } from '@/lib/security/context';
import { requireAgent } from '@/lib/security/agent';
import { isSuperAdmin, requireSuperAdmin } from '@/lib/security/super-admin';
import { adminClient } from '@/lib/supabase/server';
import { configSchema } from '@/lib/domain';
import { encrypt, decrypt } from '@/lib/security/crypto';
import { serverCredential } from '@/lib/ai/credentials';
import { credentialContext, usableOverride, type AgentAIRecord } from '@/lib/ai/agent-config';
import { validateAgentModel } from '@/lib/ai/validate-model';
type Params = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await guard(request),
      { id } = await params;
    await requireAgent(ctx, id);
    const rows = checked(
      await adminClient()
        .from('agent_ai_configs')
        .select('*')
        .eq('workspace_id', ctx.workspaceId)
        .eq('agent_id', id),
    ) as AgentAIRecord[];
    return Response.json(
      {
        canManage: isSuperAdmin(ctx.user),
        configs: rows.map((r) => ({
          purpose: r.purpose,
          provider: r.provider,
          model: r.model,
          enabled: r.enabled,
          active: !!usableOverride(r, ctx.workspaceId, id),
          credentialConfigured: !!r.credential_ciphertext,
        })),
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await guard(request);
    requireSuperAdmin(ctx.user);
    const { id } = await params;
    await requireAgent(ctx, id);
    const raw = await request.json();
    if (raw.action === 'restore') {
      if (raw.confirm !== true) throw new AppError('Confirme a restauração do padrão do sistema.');
      checked(
        await adminClient().rpc('save_agent_ai', {
          w: ctx.workspaceId,
          a: id,
          actor_id: ctx.user.id,
          configs: [],
        }),
      );
      return Response.json({ ok: true });
    }
    const input = z
      .object({
        action: z.literal('save'),
        configs: z
          .array(
            configSchema.and(
              z.object({
                apiKey: z.string().trim().min(1).max(4096).optional(),
                useServerCredential: z.boolean().optional(),
              }),
            ),
          )
          .max(4),
      })
      .parse(raw);
    if(!input.configs.length)throw new AppError('Use Restaurar padrão do sistema para remover todas as personalizações.');
    if (new Set(input.configs.map((c) => c.purpose)).size !== input.configs.length)
      throw new AppError('invalid_input');
    const old = checked(
      await adminClient()
        .from('agent_ai_configs')
        .select('*')
        .eq('workspace_id', ctx.workspaceId)
        .eq('agent_id', id),
    ) as AgentAIRecord[];
    const records = [];
    for (const c of input.configs) {
      const previous = old.find((r) => r.purpose === c.purpose && r.provider === c.provider);
      const aad = credentialContext(ctx.workspaceId, id, c.purpose, c.provider);
      let ciphertext = c.useServerCredential ? null : previous?.credential_ciphertext || null;
      if (c.apiKey) ciphertext = encrypt(c.apiKey, aad);
      let key: string | undefined;
      try {
        key = ciphertext ? decrypt(ciphertext, aad) : serverCredential(c.provider);
      } catch {
        throw new AppError('Não foi possível abrir a credencial. Cadastre uma nova API Key.');
      }
      if (!key) throw new AppError('Configure uma API Key para este provedor.');
      await validateAgentModel(c, key);
      records.push({ ...configSchema.parse(c), credential_ciphertext: ciphertext });
    }
    checked(
      await adminClient().rpc('save_agent_ai', {
        w: ctx.workspaceId,
        a: id,
        actor_id: ctx.user.id,
        configs: records,
      }),
    );
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return fail(e);
  }
}
