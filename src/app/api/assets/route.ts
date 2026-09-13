import { z } from 'zod';
import { guard, checked, required, fail, AppError } from '@/lib/security/context';
import { adminClient } from '@/lib/supabase/server';
import { validateFile } from '@/lib/security/uploads';
export async function GET(request: Request) {
  try {
    const ctx = await guard(request),
      page = Math.max(1, Number(new URL(request.url).searchParams.get('page')) || 1);
    const result = await ctx.db
      .from('assets')
      .select('*', { count: 'exact' })
      .eq('workspace_id', ctx.workspaceId)
      .order('created_at', { ascending: false })
      .range((page - 1) * 24, page * 24 - 1);
    const items = checked(result);
    for (const item of items || []) {
      const signed = await ctx.db.storage
        .from('brand-assets')
        .createSignedUrl(item.storage_path, 900);
      item.url = signed.data?.signedUrl;
    }
    return Response.json({ items, total: result.count });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: Request) {
  try {
    const ctx = await guard(request, 'write'),
      form = await request.formData(),
      file = form.get('file');
    if (!(file instanceof File)) throw new AppError('invalid_input');
    if (file.size > 10 * 1024 * 1024) throw new AppError('file_too_large');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const ext = validateFile(bytes, file.type),
      id = crypto.randomUUID(),
      path = `workspace/${ctx.workspaceId}/library/${id}.${ext}`;
    const db = adminClient();
    checked(
      await db.storage
        .from('brand-assets')
        .upload(path, bytes, { contentType: file.type, upsert: false }),
    );
    const result = await db.from('assets').insert({
      id,
      workspace_id: ctx.workspaceId,
      name: file.name.slice(0, 160),
      category: String(form.get('category') || 'reference').slice(0, 80),
      mime_type: file.type,
      storage_path: path,
      size: file.size,
      created_by: ctx.user.id,
    });
    if (result.error) {
      await db.storage.from('brand-assets').remove([path]);
      throw new AppError('database_error', 503);
    }
    return Response.json({ id });
  } catch (e) {
    return fail(e);
  }
}
export async function PATCH(request: Request) {
  try {
    const ctx = await guard(request, 'write');
    const raw = await request.json();
    if (raw.action === 'associate') {
      const input = z.object({ id: z.uuid(), agent_ids: z.array(z.uuid()).max(100) }).parse(raw);
      checked(
        await adminClient().rpc('set_asset_agents', {
          w: ctx.workspaceId,
          actor_id: ctx.user.id,
          asset: input.id,
          agents: input.agent_ids,
        }),
      );
      return Response.json({ ok: true });
    }
    const { id, ...input } = z
      .object({
        id: z.uuid(),
        name: z.string().min(1).max(160),
        category: z.string().min(1).max(80),
      })
      .parse(raw);
    checked(
      await ctx.db
        .from('assets')
        .update(input)
        .eq('id', id)
        .eq('workspace_id', ctx.workspaceId)
        .select()
        .single(),
    );
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
export async function DELETE(request: Request) {
  try {
    const ctx = await guard(request, 'write');
    const { id } = z.object({ id: z.uuid() }).parse(await request.json());
    const item = required(
      await ctx.db
        .from('assets')
        .select('storage_path')
        .eq('id', id)
        .eq('workspace_id', ctx.workspaceId)
        .single(),
    );
    const db = adminClient();
    checked(await db.storage.from('brand-assets').remove([item.storage_path]));
    checked(await db.from('assets').delete().eq('id', id).eq('workspace_id', ctx.workspaceId));
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
