import { connectionCapabilities } from '@/lib/social/connection-capabilities';
import { uploadAccountFile } from '@/lib/account-storage';
import { mp4Dimensions, MAX_IMPORT_VIDEO_BYTES } from './video';
import 'server-only';
import sharp from 'sharp';
import { adminClient } from '@/lib/supabase/server';
import { AppError, checked, required, type context } from '@/lib/security/context';
import { validateFile } from '@/lib/security/uploads';
import { channels, type Channel, type Destination } from '@/lib/domain';
import { connectors } from '@/lib/social/connectors';
import { publishVariantContent } from '@/lib/social/publisher';
import { importImages, MAX_IMPORT_IMAGES, MAX_IMPORT_IMAGE_BYTES } from './images';
type Context = Awaited<ReturnType<typeof context>>;

function detectImportImageMime(bytes: Uint8Array) {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return 'image/png' as const;
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return 'image/jpeg' as const;
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return 'image/webp' as const;
  throw new AppError('invalid_input');
}

export async function importRecord(ctx: Context, id: string) {
  const row = checked(
    await ctx.db
      .from('import_overview')
      .select('*')
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId)
      .maybeSingle(),
  );
  if (!row) throw new AppError('forbidden', 403);
  return row;
}
export async function signedImport(ctx: Context, row: Parameters<typeof importImages>[0]) {
  const images = await Promise.all(
    importImages(row).map(async (image) => {
      const signed = required(
        await ctx.db.storage.from('brand-assets').createSignedUrl(image.storage_path, 900),
      );
      return { ...image, url: signed.signedUrl };
    }),
  );
  return { ...row, images, url: images[0].url };
}
export async function uploadImport(ctx: Context, agentId: string, input: File | File[], replaceId?: string) {
  const files = Array.isArray(input) ? input : [input];
  if (!files.length || files.length > MAX_IMPORT_IMAGES)
    throw new AppError('Selecione de 1 a 6 imagens por postagem.');

  if (process.env.NODE_ENV !== 'production' || process.env.DEBUG) {
    console.log('[Import Upload Diagnostics]', {
      fileCount: files.length,
      files: files.map((f, idx) => ({
        index: idx,
        name: f.name,
        type: f.type,
        size: f.size,
      })),
      agentId,
      workspaceId: ctx.workspaceId,
    });
  }

  const agent = checked(
    await ctx.db
      .from('agents')
      .select('id')
      .eq('id', agentId)
      .eq('workspace_id', ctx.workspaceId)
      .maybeSingle(),
  );
  if (!agent) throw new AppError('forbidden', 403);
  // Validate every slide before creating files or the import record.
  const prepared = [];
  for (const [index, file] of files.entries()) {
    if (file.type === 'video/mp4' || file.name.toLowerCase().endsWith('.mp4')) {
      if (files.length !== 1) throw new AppError('Selecione apenas um vídeo, sem imagens.');
      if (file.size > MAX_IMPORT_VIDEO_BYTES) throw new AppError('file_too_large', 413);
      const bytes = new Uint8Array(await file.arrayBuffer());
      prepared.push({ bytes, ext: 'mp4', mime_type: 'video/mp4' as const, ...mp4Dimensions(bytes) });
      continue;
    }
    const rawType = (file.type || '').toLowerCase();
    const declaredMime =
      rawType === 'image/jpg' || rawType === 'image/pjpeg' ? 'image/jpeg' : rawType;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(declaredMime))
      throw new AppError('invalid_input');
    if (file.size > MAX_IMPORT_IMAGE_BYTES) throw new AppError('file_too_large', 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = detectImportImageMime(bytes);
    const ext = validateFile(bytes, mime);
    const metadata = await sharp(bytes, { limitInputPixels: 40000000 }).metadata();
    if (!metadata.width || !metadata.height || (metadata.pages || 1) > 1)
      throw new AppError('invalid_input');
    if (declaredMime !== mime && (process.env.NODE_ENV !== 'production' || process.env.DEBUG)) {
      console.info('[Import Upload Type Normalized]', {
        index,
        name: file.name,
        declaredMime,
        detectedMime: mime,
      });
    }
    const swapped = [5, 6, 7, 8].includes(metadata.orientation || 1);
    prepared.push({
      bytes,
      ext,
      mime_type: mime,
      width: swapped ? metadata.height : metadata.width,
      height: swapped ? metadata.width : metadata.height,
    });
  }
  const previous = replaceId ? await importRecord(ctx, replaceId) : null;
  if (previous && (previous.content_id || previous.agent_id !== agentId || previous.mime_type !== 'video/mp4' || prepared.length !== 1 || prepared[0].mime_type !== 'video/mp4')) throw new AppError('import_images_locked',409);
  const id = replaceId || crypto.randomUUID();
  const images = prepared.map((image, position) => ({
    storage_path: `workspace/${ctx.workspaceId}/imports/${id}/${position === 0 ? (replaceId ? 'original-' + crypto.randomUUID() : 'original') : `slide-${position + 1}`}.${image.ext}`,
    mime_type: image.mime_type,
    width: image.width,
    height: image.height,
  }));

  if (process.env.NODE_ENV !== 'production' || process.env.DEBUG) {
    console.log('[Import Upload Validated]', {
      importId: id,
      slides: images.map((img, idx) => ({
        position: idx + 1,
        path: img.storage_path,
        mime: img.mime_type,
        dimensions: `${img.width}x${img.height}`,
      })),
    });
  }

  const db = adminClient(),
    storage = db.storage.from('brand-assets');
  const attemptedPaths: string[] = [];
  try {
    for (const [position, image] of images.entries()) {
      attemptedPaths.push(image.storage_path);
      await uploadAccountFile({ workspaceId:ctx.workspaceId, userId:ctx.user.id, path:image.storage_path, bytes:prepared[position].bytes, contentType:image.mime_type });
    }
    const row = previous ? await db.rpc('replace_import_video', { w:ctx.workspaceId, u:ctx.user.id, i:id, expected:previous.storage_path, media:images[0] }) : await db
      .from('content_imports')
      .insert({
        id,
        workspace_id: ctx.workspaceId,
        agent_id: agentId,
        created_by: ctx.user.id,
        ...images[0],
        images,
      })
      .select('*')
      .single();
    if (row.error) throw new AppError('database_error', 503);

    if (process.env.NODE_ENV !== 'production' || process.env.DEBUG) {
      console.log('[Import Upload Saved]', {
        importId: id,
        totalImages: images.length,
        firstImage: images[0].storage_path,
      });
    }

    if (previous) {
      const removed = await storage.remove(importImages(previous).map(m=>m.storage_path));
      if (removed.error) console.error('replaced_import_cleanup_pending', { importId:id });
    }
    return row.data;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production' || process.env.DEBUG) {
      console.error('[Import Upload Failed]', {
        importId: id,
        error: error instanceof Error ? error.message : error,
        attemptedPaths,
      });
    }
    const cleanup = await storage.remove(attemptedPaths);
    if (cleanup?.error) console.error('import_upload_cleanup_failed', { importId: id });
    throw error;
  }
}
export async function importConnection(
  ctx: Context,
  agentId: string,
  connectionId: string,
  action: 'publish' | 'schedule',
) {
  const connection = checked(
    await adminClient()
      .from('social_connections')
      .select('id,agent_id,channel,metadata')
      .eq('workspace_id', ctx.workspaceId)
      .eq('agent_id', agentId)
      .eq('id', connectionId)
      .maybeSingle(),
  );
  if (!connection) throw new AppError('Nenhuma conta conectada apta à publicação.', 409);
  const connector = connectors[connection.channel as Channel];
  const caps = connector?.capabilities();
  if (
    String(connection.metadata?.connected_via || '').startsWith('demo') ||
    !caps ||
    !(action === 'publish' ? caps.canPublish : caps.canSchedule)
  )
    throw new AppError('official_integration_required', 409);
  return connection;
}
export async function finalizeImport(
  ctx: Context,
  id: string,
  input: {
    caption: string;
    channel: Channel;
    action: 'save' | 'publish' | 'schedule';
    connection_id?: string;
    scheduled_at?: string;
    destination?: Destination;
  },
) {
  const row = await importRecord(ctx, id);
  let channel = input.channel;
  if (input.action !== 'save') {
    if (!input.connection_id) throw new AppError('official_integration_required', 409);
    const connection = await importConnection(ctx, row.agent_id, input.connection_id, input.action);
    channel = connection.channel as Channel;
    const caps = connectionCapabilities(channel, connection.metadata);
    const allowed = row.mime_type === 'video/mp4' ? caps.videoDestinations || [] : caps.supportedDestinations;
    if (!allowed.includes(input.destination || 'feed')) throw new AppError('unsupported_capability', 409);
  }
  if (!input.caption.trim() || input.caption.length > channels[channel].limit)
    throw new AppError(
      `A legenda deve ter entre 1 e ${channels[channel].limit} caracteres para este canal.`,
    );
  if (
    input.action === 'schedule' &&
    (!input.scheduled_at || Date.parse(input.scheduled_at) <= Date.now())
  )
    throw new AppError('invalid_schedule');
  const db = adminClient();
  const contentId = checked(
    await db.rpc('finalize_content_import', {
      w: ctx.workspaceId,
      i: id,
      actor_id: ctx.user.id,
      ch: channel,
      caption_text: input.caption,
    }),
  );

  if (input.destination || input.connection_id) {
    const existing = await db
      .from('content_items')
      .select('strategy')
      .eq('id', contentId)
      .eq('workspace_id', ctx.workspaceId)
      .maybeSingle();
    const strat = (existing?.data?.strategy as Record<string, unknown>) || {};
    await db
      .from('content_items')
      .update({
        strategy: {
          ...strat,
          destination: input.destination,
          connection_id: input.connection_id,
        },
      })
      .eq('id', contentId)
      .eq('workspace_id', ctx.workspaceId);
  }

  if (input.action === 'publish') {
    await publishVariantContent({
      workspaceId: ctx.workspaceId,
      contentId,
      actorId: ctx.user.id,
      destination: input.destination,
    });
  } else if (input.action === 'schedule') {
    const item = required(
      await ctx.db
        .from('content_items')
        .select('id,version,status')
        .eq('id', contentId)
        .eq('workspace_id', ctx.workspaceId)
        .single(),
    );
    if (item.status !== 'SCHEDULED') {
      checked(
        await db.rpc('mutate_content', {
          w: ctx.workspaceId,
          c: contentId,
          expected: item.version,
          operation: 'schedule',
          actor_id: ctx.user.id,
          payload: { scheduled_at: input.scheduled_at },
        }),
      );
    }
  }
  return { content_id: contentId };
}
