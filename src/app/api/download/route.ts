import { z } from 'zod';
import { guard, required, fail } from '@/lib/security/context';
export async function GET(request: Request) {
  try {
    const ctx = await guard(request),
      url = new URL(request.url),
      id = z.uuid().parse(url.searchParams.get('id'));
    const table = url.searchParams.get('type') === 'media' ? 'content_media' : 'assets';
    const item = required(
      await ctx.db
        .from(table)
        .select('storage_path')
        .eq('id', id)
        .eq('workspace_id', ctx.workspaceId)
        .single(),
    );
    const isOriginal = url.searchParams.get('original') === 'true';
    let targetPath = item.storage_path;
    if (isOriginal && table === 'content_media') {
      const origCandidate = targetPath.replace(/\.png$/, '-original.png');
      const checkOrig = await ctx.db.storage.from('brand-assets').download(origCandidate);
      if (!checkOrig.error && checkOrig.data) {
        targetPath = origCandidate;
      }
    }
    const { data, error } = await ctx.db.storage.from('brand-assets').download(targetPath);
    if (error || !data) throw new Error('internal_error');
    return new Response(data, {
      headers: {
        'Content-Type': data.type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${id}.${item.storage_path.split('.').pop()}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    return fail(e);
  }
}
