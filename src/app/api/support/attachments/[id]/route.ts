import { z } from 'zod';
import sharp from 'sharp';
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
        .select('storage_path,original_name,mime_type')
        .eq('id', id)
        .eq('workspace_id', ctx.workspaceId)
        .maybeSingle(),
    );
    if (!file) throw new AppError('not_found', 404);
    const preview=new URL(request.url).searchParams.get('preview')==='1';
    if(preview && !['image/png','image/jpeg','image/webp'].includes(file.mime_type))throw new AppError('invalid_input');
    if(preview){
      const blob=checked(await adminClient().storage.from('support').download(file.storage_path));
      if(!blob)throw new AppError('not_found',404);
      const thumbnail=await sharp(Buffer.from(await blob.arrayBuffer()),{limitInputPixels:40000000}).rotate().resize(240,180,{fit:'inside',withoutEnlargement:true}).webp().toBuffer();
      return new Response(new Uint8Array(thumbnail),{headers:{'Content-Type':'image/webp','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
    }
    const signed = checked(
      await adminClient()
        .storage.from('support')
        .createSignedUrl(file.storage_path, 60, preview?undefined:{ download: file.original_name }),
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
