import { guard, checked, fail } from '@/lib/security/context';
import { uploadImport } from '@/features/imports/service';
import { z } from 'zod';
export async function GET(request: Request) {
  try {
    const ctx = await guard(request),
      params = new URL(request.url).searchParams;
    const page = z.coerce
        .number()
        .int()
        .min(1)
        .max(100000)
        .parse(params.get('page') || 1),
      size = params.get('recent') === '1' ? 5 : 20;
    let query = ctx.db
      .from('import_overview')
      .select('*', { count: 'exact' })
      .eq('workspace_id', ctx.workspaceId);
    const q = (params.get('q') || '')
      .trim()
      .slice(0, 200)
      .replace(/[%_,().\\]/g, ' ');
    if (q) query = query.or(`title.ilike.%${q}%,caption.ilike.%${q}%`);
    const status = params.get('status');
    if (status)
      query = query.eq(
        'import_status',
        z.enum(['Rascunho', 'Agendado', 'Publicado']).parse(status),
      );
    const agent = params.get('agent');
    if (agent) query = query.eq('agent_id', z.uuid().parse(agent));
    const result = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range((page - 1) * size, page * size - 1);
    const rows = checked(result) || [];
    const items = await Promise.all(
      rows.map(async (row) => {
        const signed = checked(
          await ctx.db.storage.from('brand-assets').createSignedUrl(row.storage_path, 900),
        );
        return { ...row, url: signed?.signedUrl };
      }),
    );
    return Response.json(
      { items, total: result.count || 0, page, pageSize: size },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: Request) {
  try {
    const ctx = await guard(request, 'write'),
      form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new Error('invalid_input');
    const row = await uploadImport(ctx, z.uuid().parse(form.get('agent_id')), file);
    return Response.json(row, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
