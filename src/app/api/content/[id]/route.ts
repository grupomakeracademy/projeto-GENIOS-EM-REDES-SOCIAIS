import { z } from 'zod';
import { guard, checked, fail, AppError } from '@/lib/security/context';
import { adminClient } from '@/lib/supabase/server';
import { channels, type Channel } from '@/lib/domain';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await guard(request),
      { id } = await params;
    z.uuid().parse(id);
    const item = checked(
      await ctx.db
        .from('content_items')
        .select('*,content_variants(*,content_media(*)),content_events(*)')
        .eq('id', id)
        .eq('workspace_id', ctx.workspaceId)
        .single(),
    );
    for (const variant of item.content_variants)
      for (const media of variant.content_media) {
        const signed = await ctx.db.storage
          .from('brand-assets')
          .createSignedUrl(media.storage_path, 900);
        media.url = signed.data?.signedUrl;
      }
    return Response.json(item);
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await guard(request, 'write'),
      { id } = await params;
    z.uuid().parse(id);
    const raw = await request.json();
    const { action, version } = z
      .object({
        action: z.enum([
          'approve',
          'reject',
          'archive',
          'schedule',
          'edit',
          'regenerate_copy',
          'regenerate_image',
        ]),
        version: z.number().int().min(1),
      })
      .parse(raw);
    const db = adminClient();
    const item = checked(
      await ctx.db
        .from('content_items')
        .select('*,content_variants(id,channel,caption)')
        .eq('id', id)
        .eq('workspace_id', ctx.workspaceId)
        .maybeSingle(),
    );
    if (!item) throw new AppError('forbidden', 403);
    if (item.version !== version) throw new AppError('conflict', 409);
    if (action.startsWith('regenerate_')) {
      if (!['AWAITING_REVIEW', 'REJECTED', 'FAILED'].includes(item.status))
        throw new AppError('conflict', 409);
      const payload = z
        .object({
          variant_id: z.uuid(),
          position: z.number().int().min(0).max(19).optional(),
          idempotency_key: z.uuid(),
        })
        .parse(raw);
      if (!item.content_variants.some((v: { id: string }) => v.id === payload.variant_id))
        throw new AppError('forbidden', 403);
      const queued = await db.rpc('enqueue_regeneration', {
        w: ctx.workspaceId,
        c: id,
        v: payload.variant_id,
        expected: version,
        operation: action,
        pos: payload.position ?? 0,
        k: `${ctx.workspaceId}:${payload.idempotency_key}`,
        actor_id: ctx.user.id,
      });
      if (queued.error) throw new AppError('conflict', 409);
      return Response.json({ ok: true }, { status: 202 });
    }
    const payload: Record<string, unknown> = {};
    if (action === 'edit') {
      const v = z
        .object({ variant_id: z.uuid(), caption: z.string().min(1).max(63206) })
        .parse(raw);
      const variant = item.content_variants.find((c: { id: string }) => c.id === v.variant_id);
      if (!variant || v.caption.length > channels[variant.channel as Channel].limit)
        throw new AppError('invalid_input');
      Object.assign(payload, v);
    }
    if (action === 'schedule') {
      const v = z.object({ scheduled_at: z.iso.datetime() }).parse(raw);
      if (Date.parse(v.scheduled_at) <= Date.now()) throw new AppError('invalid_schedule');
      Object.assign(payload, v);
    }
    if (action === 'reject')
      payload.reason = z
        .string()
        .max(2000)
        .parse(raw.reason || '');
    const result = await db.rpc('mutate_content', {
      w: ctx.workspaceId,
      c: id,
      expected: version,
      operation: action,
      payload,
      actor_id: ctx.user.id,
    });
    if (result.error)
      throw new AppError(
        result.error.message.includes('conflict') ? 'conflict' : 'invalid_input',
        409,
      );
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
