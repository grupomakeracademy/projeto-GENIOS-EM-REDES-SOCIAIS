import { z } from 'zod';
import { guard, fail } from '@/lib/security/context';
import { supportResult, ticketInput } from '@/lib/support/server';
export async function GET(request: Request) {
  try {
    const ctx = await guard(request);
    const filters = z
      .object({
        type: z.enum(['support', 'announcement']).default('support'),
        status: z.enum(['', 'aberto', 'em_andamento', 'respondido', 'fechado']).default(''),
        priority: z.enum(['', 'baixa', 'normal', 'alta']).default(''),
        category: z.string().max(40).default(''),
        q: z.string().max(200).default(''),
        user: z.union([z.uuid(), z.literal('')]).default(''),
        from: z
          .string()
          .regex(/^(\d{4}-\d{2}-\d{2})?$/)
          .default(''),
        to: z
          .string()
          .regex(/^(\d{4}-\d{2}-\d{2})?$/)
          .default(''),
        page: z.coerce.number().int().min(0).max(100000).default(0),
      })
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    return Response.json(
      supportResult(await ctx.db.rpc('support_list', { w: ctx.workspaceId, filters })),
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: Request) {
  try {
    const ctx = await guard(request);
    const input = ticketInput.parse(await request.json());
    return Response.json(
      supportResult(
        await ctx.db.rpc('support_create', {
          w: ctx.workspaceId,
          title: input.title,
          category: input.category,
          priority: input.priority,
          body: input.message,
        }),
      ),
      { status: 201 },
    );
  } catch (e) {
    return fail(e);
  }
}
