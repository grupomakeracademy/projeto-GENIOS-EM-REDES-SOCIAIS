import { z } from 'zod';
import { guard, fail } from '@/lib/security/context';
import { AIService } from '@/lib/ai/service';
import { requireAgent } from '@/lib/security/agent';

export async function POST(request: Request) {
  try {
    const ctx = await guard(request, 'read');
    const input = z
      .object({
        text: z.string().trim().min(1).max(10000),
        type: z.enum(['instruction', 'cta']),
        agent_id: z.string().uuid().optional(),
      })
      .parse(await request.json());

    if (input.agent_id) {
      await requireAgent(ctx, input.agent_id);
    }

    const ai = new AIService(ctx.workspaceId, undefined, input.agent_id, {trigger:'user_action',source:'src/app/api/ai/magic-prompt/route.ts:POST',reason:`magic_${input.type}`,agentId:input.agent_id});

    if (input.type === 'instruction') {
      const response = await ai.text(
        'text',
        z.object({
          improved_text: z
            .string()
            .describe('Versão melhorada, mais clara, estruturada e organizada da pauta'),
        }),
        {
          task: 'Você é um estrategista sênior de redes sociais. Sua função é organizar e melhorar a redação e estrutura da pauta/instrução a seguir fornecida pelo usuário. Mantenha 100% da intenção, tom e contexto originais, sem inventar fatos ou alterar o sentido da ideia.',
          texto_original_do_usuario: input.text,
        },
      );
      return Response.json({ refinedText: response.improved_text.trim() });
    } else {
      const response = await ai.text(
        'text',
        z.object({
          improved_text: z
            .string()
            .describe('Versão melhorada, mais persuasiva e direta da CTA'),
        }),
        {
          task: 'Você é um copywriter especialista em redes sociais. Melhore a chamada para ação (CTA) a seguir tornando-a mais persuasiva, direta e atrativa, preservando fielmente o objetivo que o usuário pretendia alcançar.',
          cta_original_do_usuario: input.text,
        },
      );
      return Response.json({ refinedText: response.improved_text.trim() });
    }
  } catch (e) {
    return fail(e);
  }
}
