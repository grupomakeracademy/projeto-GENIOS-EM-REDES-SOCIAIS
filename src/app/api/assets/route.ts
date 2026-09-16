import { z } from 'zod';
import { guard, checked, required, fail, AppError } from '@/lib/security/context';
import { adminClient } from '@/lib/supabase/server';
import { validateFile } from '@/lib/security/uploads';
import { isSuperAdmin } from '@/lib/security/super-admin';
import { computeContentHash, processAssetKnowledge } from '@/lib/ai/asset-knowledge';
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
      const hash = computeContentHash(bytes);

      checked(
        await db.storage
          .from('brand-assets')
          .upload(path, bytes, { contentType: file.type, upsert: false }),
      );

      const category = String(form.get('category') || 'reference').slice(0, 80);
      const identityName = form.get('identity_name') ? String(form.get('identity_name')).trim().slice(0, 120) : null;
      const identityType = form.get('identity_type') ? String(form.get('identity_type')).trim().slice(0, 50) : null;
      const isMaster =
        form.get('is_master') === 'true' ||
        form.get('is_master') === '1' ||
        form.get('is_master') === 'on';
      const assetSubtype = form.get('asset_subtype') ? String(form.get('asset_subtype')).trim().slice(0, 50) : null;
      const placement = form.get('placement') ? String(form.get('placement')).trim().slice(0, 50) : 'top_left';
      const scalePercent = form.get('scale_percent')
        ? Math.min(100, Math.max(5, parseInt(String(form.get('scale_percent')), 10) || 22))
        : 22;

      if (isMaster && identityName) {
        await db
          .from('assets')
          .update({ is_master: false })
          .eq('workspace_id', ctx.workspaceId)
          .eq('identity_name', identityName);
      }

      const result = await db.from('assets').insert({
        id,
        workspace_id: ctx.workspaceId,
        name: file.name.slice(0, 160),
        category,
        identity_name: identityName,
        identity_type: identityType,
        is_master: isMaster,
        asset_subtype: assetSubtype,
        placement,
        scale_percent: scalePercent,
        mime_type: file.type,
        storage_path: path,
        size: file.size,
        created_by: ctx.user.id,
        content_hash: hash,
        processing_status: 'pending',
      });

      if (result.error) {
        await db.storage.from('brand-assets').remove([path]);
        throw new AppError('database_error', 503);
      }
      uploadedAssets.push({ id, name: file.name });

      // Check if identical file was already processed elsewhere (free deduplication, 0 API calls)
      const { data: existingProcessed } = await db
        .from('assets')
        .select('textual_interpretation, summary_text, processor_model, processing_version')
        .eq('content_hash', hash)
        .eq('processing_status', 'processed')
        .not('summary_text', 'is', null)
        .limit(1)
        .maybeSingle();

      if (existingProcessed?.summary_text) {
        await db
          .from('assets')
          .update({
            processing_status: 'processed',
            processed_at: new Date().toISOString(),
            processor_model: existingProcessed.processor_model,
            processing_version: existingProcessed.processing_version || 1,
            textual_interpretation: existingProcessed.textual_interpretation,
            summary_text: existingProcessed.summary_text,
          })
          .eq('id', id);
      }
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
    if (raw.action === 'reprocess') {
      const input = z.object({ id: z.uuid() }).parse(raw);
      const db = adminClient();
      const { data: assetItem } = await db
        .from('assets')
        .select('category')
        .eq('id', input.id)
        .eq('workspace_id', ctx.workspaceId)
        .maybeSingle();

      if (!assetItem) throw new AppError('forbidden', 403);

      // Never invoke vision/AI for protected identity or exact asset (0 API cost)
      if (assetItem && (assetItem.category === 'protected_identity' || assetItem.category === 'exact_asset')) {
        return Response.json({ ok: true, skipped: true, reason: 'unsupported_category', visionCallsMade: 0 });
      }

      const result = await processAssetKnowledge(input.id, { force: true });
      return Response.json({ ok: true, ...result });
    }
    if (raw.action === 'associate') {
      const input = z.object({ id: z.uuid(), agent_ids: z.array(z.uuid()).max(100) }).parse(raw);
      const db = adminClient();
      const { data: assetItem } = await db
        .from('assets')
        .select('id, workspace_id')
        .eq('id', input.id)
        .maybeSingle();
      if (!assetItem) throw new AppError('asset_not_found', 404);
      const targetWs = assetItem.workspace_id || ctx.workspaceId;
      checked(
        await db.rpc('set_asset_agents', {
          w: targetWs,
          actor_id: ctx.user.id,
          asset: input.id,
          agents: input.agent_ids,
        }),
      );
      return Response.json({ ok: true });
    }
    if (raw.action === 'set_master') {
      const input = z.object({ id: z.uuid(), identity_name: z.string().min(1).max(120).optional() }).parse(raw);
      const db = adminClient();
      const { data: assetItem } = await db
        .from('assets')
        .select('id, workspace_id, identity_name, name')
        .eq('id', input.id)
        .eq('workspace_id', ctx.workspaceId)
        .maybeSingle();
      if (!assetItem) throw new AppError('asset_not_found', 404);

      const idName = input.identity_name || assetItem.identity_name || assetItem.name.replace(/\.[^/.]+$/, '');
      await db
        .from('assets')
        .update({ is_master: false })
        .eq('workspace_id', ctx.workspaceId)
        .eq('identity_name', idName)
        .neq('id', input.id);

      await db
        .from('assets')
        .update({ is_master: true, category: 'protected_identity', identity_name: idName })
        .eq('id', input.id)
        .eq('workspace_id', ctx.workspaceId);

      return Response.json({ ok: true, is_master: true, identity_name: idName });
    }
    const { id, ...input } = z
      .object({
        id: z.uuid(),
        name: z.string().min(1).max(160),
        category: z.string().min(1).max(80),
        identity_name: z.string().max(120).nullable().optional(),
        identity_type: z.string().max(50).nullable().optional(),
        is_master: z.boolean().optional(),
        asset_subtype: z.string().max(50).nullable().optional(),
        placement: z.string().max(50).nullable().optional(),
        scale_percent: z.number().int().min(5).max(100).nullable().optional(),
      })
      .parse(raw);

    const db = adminClient();
    if (input.is_master && input.identity_name) {
      await db
        .from('assets')
        .update({ is_master: false })
        .eq('workspace_id', ctx.workspaceId)
        .eq('identity_name', input.identity_name)
        .neq('id', id);
    }

    checked(
      await db
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
