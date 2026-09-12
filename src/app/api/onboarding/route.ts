import { z } from 'zod';
import { cookies } from 'next/headers';
import { sessionClient } from '@/lib/supabase/server';
import { channelSchema } from '@/lib/domain';
import { AppError, checked, fail, requireSameOrigin } from '@/lib/security/context';
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const db = await sessionClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) throw new AppError('unauthorized', 401);
    const { draft, complete } = z
      .object({ draft: z.record(z.string(), z.unknown()), complete: z.boolean() })
      .parse(await request.json());
    if (JSON.stringify(draft).length > 30000) throw new AppError('invalid_input');
    if (!complete) {
      checked(await db.from('profiles').upsert({ id: user.id, onboarding_draft: draft }));
      return Response.json({ ok: true });
    }
    const form = z
      .object({
        company: z.string().trim().min(2).max(160),
        agentName: z.string().trim().min(2).max(160),
        product: z.string().min(3),
        audience: z.string().min(3),
        channels: z.array(channelSchema).min(1),
        timezone: z.string().min(2),
      })
      .passthrough()
      .parse(draft);
    const id = checked(
      await db.rpc('complete_onboarding', {
        company: form.company,
        agent_name: form.agentName,
        config: form,
        tz: form.timezone,
      }),
    );
    (await cookies()).set('workspace', id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
    return Response.json({ id });
  } catch (e) {
    return fail(e);
  }
}
