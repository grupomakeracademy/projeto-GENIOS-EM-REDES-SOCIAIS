import 'server-only';
import { z } from 'zod';
import { AIService } from '@/lib/ai/service';
import { adminClient } from '@/lib/supabase/server';
import { AppError, checked, type context } from '@/lib/security/context';
import { channels, type Channel } from '@/lib/domain';
type Context = Awaited<ReturnType<typeof context>>;
export const captionInput = z.object({
  scope: z.enum(['import', 'content']),
  id: z.uuid(),
  variant_id: z.uuid().optional(),
  kind: z.enum(['magic', 'storytelling']),
  request_id: z.uuid(),
  caption: z.string().trim().min(1).max(63206),
});
export async function improveCaption(ctx: Context, input: z.infer<typeof captionInput>) {
  input = captionInput.parse(input);
  const db = adminClient();
  let agent: string,
    scope = input.scope,
    target = input.id,
    limit = 63206;
  let textContext: Record<string, unknown> = {};
  if (input.scope === 'import') {
    const row = checked(
      await ctx.db
        .from('content_imports')
        .select('*')
        .eq('id', input.id)
        .eq('workspace_id', ctx.workspaceId)
        .is('deleted_at', null)
        .maybeSingle(),
    );
    if (!row) throw new AppError('forbidden', 403);
    agent = row.agent_id;
    textContext = { title: row.title };
    if (row.channel) limit = channels[row.channel as Channel]?.limit || limit;
    if (row.content_id) {
      const item = checked(
        await ctx.db
          .from('content_items')
          .select('status')
          .eq('id', row.content_id)
          .eq('workspace_id', ctx.workspaceId)
          .single(),
      );
      if (!item || ['GENERATING', 'PUBLISHING', 'PUBLISHED', 'ARCHIVED'].includes(item.status))
        throw new AppError('Conteúdo bloqueado para edição.', 409);
    }
  } else {
    const row = checked(
      await ctx.db
        .from('content_items')
        .select('agent_id,status,topic,strategy,content_variants(id,title,cta,channel)')
        .eq('id', input.id)
        .eq('workspace_id', ctx.workspaceId)
        .maybeSingle(),
    );
    if (!row) throw new AppError('forbidden', 403);
    if (['GENERATING', 'PUBLISHING', 'PUBLISHED', 'ARCHIVED'].includes(row.status))
      throw new AppError('Conteúdo bloqueado para edição.', 409);
    const variant = row.content_variants.find((v: { id: string }) => v.id === input.variant_id);
    if (!variant) throw new AppError('invalid_input');
    agent = row.agent_id;
    limit = channels[variant.channel as Channel].limit;
    const strategy = row.strategy || {};
    textContext = {
      title: variant.title,
      instruction: strategy.instruction || row.topic,
      objective: strategy.objective,
      cta: variant.cta || strategy.cta,
      text_style: strategy.text_style,
    };
    const imported = checked(
      await ctx.db
        .from('content_imports')
        .select('id')
        .eq('content_id', input.id)
        .eq('workspace_id', ctx.workspaceId)
        .is('deleted_at', null)
        .maybeSingle(),
    );
    if (imported) {
      scope = 'import';
      target = imported.id;
    }
  }
  const args = {
    w: ctx.workspaceId,
    a: ctx.user.id,
    s: scope,
    t: target,
    k: input.kind,
    r: input.request_id,
  };
  async function rpc(phase: string, output?: string) {
    const result = await db.rpc('caption_operation', { ...args, phase, output: output ?? null });
    if (result.error)
      throw new AppError(
        result.error.message.includes('insufficient_quota')
          ? 'Saldo insuficiente.'
          : result.error.message.includes('operation_')
            ? 'Já existe uma operação em andamento. Aguarde e tente novamente.'
            : 'Não foi possível concluir a edição.',
        409,
      );
    return result.data;
  }
  const claim = await rpc('begin');
  if (claim.completed) return claim;
  try {
    const task =
      input.kind === 'magic'
        ? 'Melhore clareza, organização e correção da legenda existente, preservando sua estrutura geral, intenção e contexto.'
        : 'Transforme a legenda em uma narrativa humana com três blocos lógicos separados por linhas em branco: Dor/situação/problema → Solução → CTA. Utilize apenas a solução e o CTA existentes. Não apenas aumente o texto. Situações genéricas devem permanecer hipotéticas, nunca fatos reais específicos.';
    const schema = z.object({
      caption: z
        .string()
        .trim()
        .min(1)
        .max(limit)
        .refine(
          (value) =>
            input.kind !== 'storytelling' ||
            value.split(/\n\s*\n/).filter((part) => part.trim()).length >= 3,
          'Storytelling precisa conter Dor, Solução e CTA em blocos separados.',
        ),
    });
    const result = schema.parse(
      await new AIService(ctx.workspaceId, undefined, agent, {trigger:'user_action',source:'src/features/captions/service.ts',reason:input.kind,agentId:agent}).text('text', schema, {
        task:
          task +
          ' Use exclusivamente estes dados textuais. Não invente fatos, depoimentos, números, clientes, benefícios, promessas ou acontecimentos. Preserve o idioma. Não há imagem disponível; não analise imagens. Retorne caption.',
        caption: input.caption,
        context: textContext,
        max_characters: limit,
      }),
    );
    // Completion, counter and central debit are one DB transaction. The editable draft is not saved here.
    return await rpc('finish', result.caption);
  } catch (error) {
    await rpc('fail').catch(() => {});
    throw error;
  }
}
