import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { guard, checked, fail, AppError } from '@/lib/security/context';
import { adminClient } from '@/lib/supabase/server';
import { getTicket } from '@/lib/support/server';
import { MAX_SUPPORT_FILE, boundedForm, validateSupportFile } from '@/lib/support/files';
export const runtime = 'nodejs';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  try {
    const ctx = await guard(request, 'read', MAX_SUPPORT_FILE + 1024 * 1024),
      { ticketId } = await params;
    await getTicket(ctx, ticketId);
    const form = await boundedForm(request),
      messageId = z.uuid().parse(form.get('messageId')),
      file = form.get('file');
    if (!(file instanceof File)) throw new AppError('invalid_input');
    if (file.size > MAX_SUPPORT_FILE) throw new AppError('file_too_large', 413);
    const message = checked(
      await ctx.db
        .from('support_messages')
        .select('user_id,created_at')
        .eq('id', messageId)
        .eq('ticket_id', ticketId)
        .eq('workspace_id', ctx.workspaceId)
        .maybeSingle(),
    );
    if (
      !message ||
      message.user_id !== ctx.user.id ||
      Date.now() - Date.parse(message.created_at) > 30 * 60 * 1000
    )
      throw new AppError('forbidden', 403);
    const bytes = Buffer.from(await file.arrayBuffer()),
      validated = validateSupportFile(file.name, file.type, bytes);
    const db = adminClient(),
      path = `${ctx.workspaceId}/${ticketId}/attachments/${randomUUID()}-${validated.name}`;
    checked(
      await db.storage
        .from('support')
        .upload(path, bytes, { contentType: validated.mime, upsert: false }),
    );
    const saved = await db
      .from('support_attachments')
      .insert({
        workspace_id: ctx.workspaceId,
        ticket_id: ticketId,
        message_id: messageId,
        uploaded_by: ctx.user.id,
        original_name: validated.name,
        storage_path: path,
        mime_type: validated.mime,
        size: bytes.length,
      })
      .select('id')
      .single();
    if (saved.error) {
      await db.storage.from('support').remove([path]);
      throw new AppError('database_error', 503);
    }
    return Response.json(saved.data, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
