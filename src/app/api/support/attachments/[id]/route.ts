import { z } from 'zod';
import { guard, checked, fail, AppError } from '@/lib/security/context';
import { adminClient } from '@/lib/supabase/server';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await guard(request),
      { id } = await params;
    z.uuid().parse(id);
    const file = checked(
      await ctx.db
        .from('support_attachments')
        .select('storage_path,original_name')
        .eq('id', id)
        .eq('workspace_id', ctx.workspaceId)
        .maybeSingle(),
    );
    if (!file) throw new AppError('not_found', 404);
    const signed = checked(
      await adminClient()
        .storage.from('support')
        .createSignedUrl(file.storage_path, 60, { download: file.original_name }),
    );
    if (!signed) throw new AppError('database_error', 503);
    return Response.json(
      { url: signed.signedUrl },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return fail(e);
  }
}
