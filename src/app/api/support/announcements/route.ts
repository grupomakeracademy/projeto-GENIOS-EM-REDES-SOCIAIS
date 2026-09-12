import { z } from 'zod';
import { guard, fail } from '@/lib/security/context';
import { ticketInput, supportResult } from '@/lib/support/server';
export async function POST(request: Request) {
  try {
    const ctx = await guard(request, 'admin');
    const input = ticketInput
      .extend({
        target: z.enum(['geral', 'individual']),
        recipient: z.uuid().nullable().default(null),
      })
      .refine((i) => (i.target === 'geral' ? i.recipient === null : !!i.recipient))
      .parse(await request.json());
    return Response.json(
      supportResult(
        await ctx.db.rpc('support_create', {
          w: ctx.workspaceId,
          title: input.title,
          category: input.category,
          priority: input.priority,
          body: input.message,
          kind: 'announcement',
          target: input.target,
          recipient: input.recipient,
        }),
      ),
      { status: 201 },
    );
  } catch (e) {
    return fail(e);
  }
}
