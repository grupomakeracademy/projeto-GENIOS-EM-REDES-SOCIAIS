import { guard, checked, fail, AppError } from '@/lib/security/context';
import { importRecord, finalizeImport, signedImport } from '@/features/imports/service';
import { importImages } from '@/features/imports/images';
import { adminClient } from '@/lib/supabase/server';
import { channelSchema } from '@/lib/domain';
import { z } from 'zod';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await guard(request),
      { id } = await params;
    const row = await importRecord(ctx, z.uuid().parse(id));
    const search = new URL(request.url).searchParams;
    if (search.has('download')) {
      const images = importImages(row);
      const position = z.coerce
        .number()
        .int()
        .min(0)
        .max(5)
        .parse(search.get('slide') ?? 0);
      const image = images[position];
      if (!image) throw new AppError('invalid_input');
      const blob = checked(await ctx.db.storage.from('brand-assets').download(image.storage_path));
      return new Response(blob, {
        headers: {
          'Content-Type': image.mime_type,
          'Content-Disposition': `attachment; filename="import-${id}${images.length > 1 ? `-slide-${position + 1}` : ''}.${image.storage_path.split('.').pop()}"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }
    return Response.json(await signedImport(ctx, row), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await guard(request, 'write'),
      { id } = await params;
    z.uuid().parse(id);
    const body = z
      .object({
        action: z.enum(['save', 'publish', 'schedule']),
        caption: z.string().trim().min(1).max(63206),
        channel: channelSchema.default('instagram'),
        connection_id: z.uuid().optional(),
        scheduled_at: z.iso.datetime().optional(),
      })
      .parse(await request.json());
    return Response.json(await finalizeImport(ctx, id, body));
  } catch (e) {
    return fail(e);
  }
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await guard(request, 'write'),
      { id } = await params;
    z.uuid().parse(id);
    const body = z
      .union([
        z.object({ caption_only: z.literal(true), caption: z.string().max(63206) }),
        z.object({
          title: z.string().max(200),
          caption: z.string().max(63206),
          channel: channelSchema.nullable(),
          connection_id: z.uuid().nullable(),
        }),
      ])
      .parse(await request.json());
    checked(
      await adminClient().rpc('save_import_draft', {
        w: ctx.workspaceId,
        a: ctx.user.id,
        i: id,
        body,
      }),
    );
    return Response.json({ saved: true });
  } catch (e) {
    return fail(e);
  }
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await guard(request, 'write'),
      { id } = await params;
    z.uuid().parse(id);
    checked(
      await adminClient().rpc('delete_import', { w: ctx.workspaceId, a: ctx.user.id, i: id }),
    );
    return Response.json({ deleted: true });
  } catch (e) {
    return fail(e);
  }
}
