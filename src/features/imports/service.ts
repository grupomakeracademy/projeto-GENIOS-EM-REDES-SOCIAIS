import 'server-only';
import sharp from 'sharp';
import { adminClient } from '@/lib/supabase/server';
import { AppError, checked, required, type context } from '@/lib/security/context';
import { validateFile } from '@/lib/security/uploads';
import { channels, type Channel } from '@/lib/domain';
import { connectors } from '@/lib/social/connectors';
import { importImages, MAX_IMPORT_IMAGES, MAX_IMPORT_IMAGE_BYTES } from './images';
type Context = Awaited<ReturnType<typeof context>>;
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
export async function uploadImport(ctx: Context, agentId: string, input: File | File[]) {
  const files = Array.isArray(input) ? input : [input];
  if (!files.length || files.length > MAX_IMPORT_IMAGES)
    throw new AppError('Selecione de 1 a 6 imagens por postagem.');
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
  for (const file of files) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
      throw new AppError('invalid_input');
    if (file.size > MAX_IMPORT_IMAGE_BYTES) throw new AppError('file_too_large', 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const ext = validateFile(bytes, file.type);
    const metadata = await sharp(bytes, { limitInputPixels: 40000000 }).metadata();
    if (!metadata.width || !metadata.height || (metadata.pages || 1) > 1)
      throw new AppError('invalid_input');
    const swapped = [5, 6, 7, 8].includes(metadata.orientation || 1);
    prepared.push({
      bytes,
      ext,
      mime_type: file.type,
      width: swapped ? metadata.height : metadata.width,
      height: swapped ? metadata.width : metadata.height,
    });
  }
  const id = crypto.randomUUID();
  const images = prepared.map((image, position) => ({
    storage_path: `workspace/${ctx.workspaceId}/imports/${id}/${position === 0 ? 'original' : `slide-${position + 1}`}.${image.ext}`,
    mime_type: image.mime_type,
    width: image.width,
    height: image.height,
  }));
  const db = adminClient(),
    storage = db.storage.from('brand-assets');
  const attemptedPaths: string[] = [];
  try {
    for (const [position, image] of images.entries()) {
      attemptedPaths.push(image.storage_path);
      checked(
        await storage.upload(image.storage_path, prepared[position].bytes, {
          contentType: image.mime_type,
          upsert: false,
        }),
      );
    }
    const row = await db
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
    return row.data;
  } catch (error) {
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
    connection.metadata?.connected_via === 'demo' ||
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
  },
) {
  const row = await importRecord(ctx, id);
  let channel = input.channel;
  if (input.action !== 'save') {
    if (!input.connection_id) throw new AppError('official_integration_required', 409);
    const connection = await importConnection(ctx, row.agent_id, input.connection_id, input.action);
    channel = connection.channel as Channel;
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
  if (input.action !== 'save') {
    const item = required(
      await ctx.db
        .from('content_items')
        .select('id,version,status')
        .eq('id', contentId)
        .eq('workspace_id', ctx.workspaceId)
        .single(),
    );
    if (item.status !== (input.action === 'publish' ? 'PUBLISHED' : 'SCHEDULED'))
      checked(
        await db.rpc('mutate_content', {
          w: ctx.workspaceId,
          c: contentId,
          expected: item.version,
          operation: input.action,
          actor_id: ctx.user.id,
          payload: input.action === 'schedule' ? { scheduled_at: input.scheduled_at } : {},
        }),
      );
  }
  return { content_id: contentId };
}
