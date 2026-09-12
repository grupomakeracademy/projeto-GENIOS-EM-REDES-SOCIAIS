import { z } from 'zod';
import { guard, fail } from '@/lib/security/context';
import { getTicket, supportResult } from '@/lib/support/server';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  try {
    const ctx = await guard(request),
      { ticketId } = await params;
    await getTicket(ctx, ticketId);
    const { seen } = z
      .object({ seen: z.iso.datetime({ offset: true }) })
      .parse(await request.json());
    supportResult(await ctx.db.rpc('support_mark_read', { t: ticketId, seen }));
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
