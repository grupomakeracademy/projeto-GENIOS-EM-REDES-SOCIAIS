import 'server-only';
import { z } from 'zod';
import { AppError, checked, type context } from '@/lib/security/context';
import { categories } from '@/features/support/types';
export const ticketInput = z.object({
  title: z.string().trim().min(3).max(180),
  category: z.enum(Object.keys(categories) as [string, ...string[]]),
  priority: z.enum(['baixa', 'normal', 'alta']).default('normal'),
  message: z.string().trim().min(1).max(20000),
});
export const replyInput = z.object({ message: z.string().trim().min(1).max(20000) });
export type SupportContext = Awaited<ReturnType<typeof context>>;
export async function getTicket(ctx: SupportContext, id: string) {
  z.uuid().parse(id);
  const ticket = checked(
    await ctx.db
      .from('support_tickets')
      .select('*')
      .eq('workspace_id', ctx.workspaceId)
      .eq('id', id)
      .maybeSingle(),
  );
  if (!ticket) throw new AppError('not_found', 404);
  return ticket;
}
export function supportResult<T>(result: { data: T; error: { message: string } | null }) {
  if (result.error?.message.includes('forbidden')) throw new AppError('forbidden', 403);
  if (result.error?.message.includes('read_only')) throw new AppError('support_read_only', 403);
  return checked(result);
}
