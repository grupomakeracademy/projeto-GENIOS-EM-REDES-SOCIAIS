import { guard, fail, checked } from '@/lib/security/context';
import { captionInput, improveCaption } from '@/features/captions/service';
import { adminClient } from '@/lib/supabase/server';
import { z } from 'zod';
export async function POST(request: Request) {
  try {
    const ctx = await guard(request, 'write');
    return Response.json(await improveCaption(ctx, captionInput.parse(await request.json())));
  } catch (e) {
    return fail(e);
  }
}
export async function PATCH(request: Request) {
  try {
    const ctx = await guard(request, 'write');
    const body = z
      .object({ variant_id: z.uuid(), caption: z.string().max(63206), version: z.number().int() })
      .parse(await request.json());
    checked(
      await adminClient().rpc('save_caption', {
        w: ctx.workspaceId,
        a: ctx.user.id,
        v: body.variant_id,
        body: body.caption,
        expected: body.version,
      }),
    );
    return Response.json({ saved: true });
  } catch (e) {
    return fail(e);
  }
}
