import 'server-only';
import { z } from 'zod';
import { context, checked, AppError } from './context';
export async function requireAgent(ctx: Awaited<ReturnType<typeof context>>, id?: string | null) {
  if (!id) return null;
  if (!z.uuid().safeParse(id).success) throw new AppError('invalid_input', 400);
  const agent = checked(
    await ctx.db
      .from('agents')
      .select('id,name')
      .eq('workspace_id', ctx.workspaceId)
      .eq('id', id)
      .maybeSingle(),
  );
  if (!agent) throw new AppError('forbidden', 403);
  return agent.id as string;
}
