import { z } from 'zod';
import { guard, checked, required, fail, AppError } from '@/lib/security/context';
import { adminClient } from '@/lib/supabase/server';
import { validateFile } from '@/lib/security/uploads';
import { isSuperAdmin } from '@/lib/security/super-admin';
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
    const ctx = await guard(request, 'write', 60 * 1024 * 1024),
      form = await request.formData();

    // Support multiple files ('files' or multiple 'file') or single 'file'
    const rawFiles = form.getAll('files').concat(form.getAll('file'));
    const files = rawFiles.filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) throw new AppError('invalid_input');

    // Limit 50 MB per batch upload
    const batchSize = files.reduce((acc, f) => acc + f.size, 0);
    if (batchSize > 50 * 1024 * 1024) {
      throw new AppError('Envio em massa limitado a 50 megas por envio.', 400);
    }

    // Check user's storage quota (default 100 MB, -1 or null = unlimited)
    const { data: userAssets } = await ctx.db
      .from('assets')
      .select('size')
      .eq('created_by', ctx.user.id);
    const usedBytes = (userAssets || []).reduce((acc, a) => acc + (a.size || 0), 0);

    const isSuper = isSuperAdmin(ctx.user);
    const { data: profile } = await ctx.db
      .from('profiles')
      .select('storage_quota_mb')
      .eq('id', ctx.user.id)
      .maybeSingle();

    const quotaMB = isSuper ? -1 : (profile?.storage_quota_mb ?? 100);
    const isUnlimited = isSuper || quotaMB === -1 || quotaMB === null;

    if (!isUnlimited && usedBytes + batchSize > quotaMB * 1024 * 1024) {
      const usedMB = (usedBytes / (1024 * 1024)).toFixed(1);
      throw new AppError(
        `Capacidade de armazenamento excedida (${usedMB} MB de ${quotaMB} MB utilizados). Contate o Super Admin para liberar mais espaço.`,
        400,
      );
    }

    const db = adminClient();
    const uploadedAssets: Array<{ id: string; name: string }> = [];

    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const ext = validateFile(bytes, file.type);
      const id = crypto.randomUUID();
      const path = `workspace/${ctx.workspaceId}/library/${id}.${ext}`;

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
      uploadedAssets.push({ id, name: file.name });
    }

    return Response.json({
      id: uploadedAssets[0]?.id,
      items: uploadedAssets,
      count: uploadedAssets.length,
    });
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
