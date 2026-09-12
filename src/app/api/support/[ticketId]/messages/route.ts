import { guard, fail } from '@/lib/security/context';
import { getTicket, replyInput, supportResult } from '@/lib/support/server';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  try {
    const ctx = await guard(request),
      { ticketId } = await params;
    await getTicket(ctx, ticketId);
    const input = replyInput.parse(await request.json());
    return Response.json(
      supportResult(await ctx.db.rpc('support_reply', { t: ticketId, body: input.message })),
      { status: 201 },
    );
  } catch (e) {
    return fail(e);
  }
}
