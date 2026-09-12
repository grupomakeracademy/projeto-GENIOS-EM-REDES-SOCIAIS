import { z } from 'zod';
import { guard, fail } from '@/lib/security/context';
import { getTicket, supportResult } from '@/lib/support/server';
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  try {
    const ctx = await guard(request, 'admin'),
      { ticketId } = await params;
    await getTicket(ctx, ticketId);
    const { value } = z
      .object({ value: z.enum(['baixa', 'normal', 'alta']) })
      .parse(await request.json());

    supportResult(
      await ctx.db.rpc('support_change', { t: ticketId, field: 'priority', value: value }),
    );
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
