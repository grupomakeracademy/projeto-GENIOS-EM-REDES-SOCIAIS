import { z } from 'zod';
import { guard, checked, fail, AppError } from '@/lib/security/context';
import { adminClient } from '@/lib/supabase/server';
import { validateFile } from '@/lib/security/uploads';
import type { UniversitySort, UniversityVideo } from '@/features/university/types';

export async function GET(request: Request) {
  try {
    await guard(request);
    const url = new URL(request.url);
    const sort = (url.searchParams.get('sort') || 'recent') as UniversitySort;

    const db = adminClient();
    let query = db.from('university_videos').select('*');

    if (sort === 'oldest') {
      query = query.order('created_at', { ascending: true });
    } else if (sort === 'updated') {
      query = query.order('updated_at', { ascending: false });
    } else if (sort === 'az') {
      query = query.order('title', { ascending: true });
    } else if (sort === 'za') {
      query = query.order('title', { ascending: false });
    } else {
      // 'recent'
      query = query.order('created_at', { ascending: false });
    }

    const items = checked(await query) as UniversityVideo[];
    return Response.json({ items: items || [] });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await guard(request, 'write');
    const contentType = request.headers.get('content-type') || '';

    let title = '';
    let videoUrl = '';
    let description = '';
    let thumbnailUrl: string | null = null;

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      title = String(form.get('title') || '').trim();
      videoUrl = String(form.get('video_url') || '').trim();
      description = String(form.get('description') || '').trim();
      const existingThumb = form.get('thumbnail_url');
      if (typeof existingThumb === 'string' && existingThumb) {
        thumbnailUrl = existingThumb;
      }

      const file = form.get('thumbnail');
      if (file instanceof File && file.size > 0) {
        if (file.size > 10 * 1024 * 1024) throw new AppError('file_too_large');
        const bytes = new Uint8Array(await file.arrayBuffer());
        const ext = validateFile(bytes, file.type);
        const fileId = crypto.randomUUID();
        const path = `workspace/${ctx.workspaceId}/university/${fileId}.${ext}`;
        const db = adminClient();
        checked(
          await db.storage
            .from('brand-assets')
            .upload(path, bytes, { contentType: file.type, upsert: true }),
        );
        const signed = await db.storage.from('brand-assets').createSignedUrl(path, 315360000);
        thumbnailUrl = signed.data?.signedUrl || null;
      }
    } else {
      const raw = await request.json();
      const parsed = z
        .object({
          title: z.string().trim().min(1).max(250),
          video_url: z.string().trim().min(1),
          description: z.string().trim().min(1),
          thumbnail_url: z.string().nullable().optional(),
        })
        .parse(raw);
      title = parsed.title;
      videoUrl = parsed.video_url;
      description = parsed.description;
      thumbnailUrl = parsed.thumbnail_url || null;
    }

    if (!title || !videoUrl || !description) {
      throw new AppError('invalid_input');
    }

    const db = adminClient();
    const item = checked(
      await db
        .from('university_videos')
        .insert({
          workspace_id: ctx.workspaceId,
          title,
          video_url: videoUrl,
          description,
          thumbnail_url: thumbnailUrl,
          created_by: ctx.user.id,
        })
        .select('*')
        .single(),
    );

    return Response.json({ ok: true, item });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await guard(request, 'write');
    const contentType = request.headers.get('content-type') || '';

    let id = '';
    let title = '';
    let videoUrl = '';
    let description = '';
    let thumbnailUrl: string | null = null;
    let hasThumbnailUpdate = false;

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      id = String(form.get('id') || '');
      title = String(form.get('title') || '').trim();
      videoUrl = String(form.get('video_url') || '').trim();
      description = String(form.get('description') || '').trim();

      if (form.has('thumbnail_url')) {
        hasThumbnailUpdate = true;
        thumbnailUrl = String(form.get('thumbnail_url') || '') || null;
      }

      const file = form.get('thumbnail');
      if (file instanceof File && file.size > 0) {
        if (file.size > 10 * 1024 * 1024) throw new AppError('file_too_large');
        const bytes = new Uint8Array(await file.arrayBuffer());
        const ext = validateFile(bytes, file.type);
        const fileId = crypto.randomUUID();
        const path = `workspace/${ctx.workspaceId}/university/${fileId}.${ext}`;
        const db = adminClient();
        checked(
          await db.storage
            .from('brand-assets')
            .upload(path, bytes, { contentType: file.type, upsert: true }),
        );
        const signed = await db.storage.from('brand-assets').createSignedUrl(path, 315360000);
        thumbnailUrl = signed.data?.signedUrl || null;
        hasThumbnailUpdate = true;
      }
    } else {
      const raw = await request.json();
      const parsed = z
        .object({
          id: z.string().uuid(),
          title: z.string().trim().min(1).max(250),
          video_url: z.string().trim().min(1),
          description: z.string().trim().min(1),
          thumbnail_url: z.string().nullable().optional(),
        })
        .parse(raw);
      id = parsed.id;
      title = parsed.title;
      videoUrl = parsed.video_url;
      description = parsed.description;
      if (parsed.thumbnail_url !== undefined) {
        hasThumbnailUpdate = true;
        thumbnailUrl = parsed.thumbnail_url;
      }
    }

    if (!id || !title || !videoUrl || !description) {
      throw new AppError('invalid_input');
    }

    const updates: Record<string, unknown> = {
      title,
      video_url: videoUrl,
      description,
      updated_at: new Date().toISOString(),
    };
    if (hasThumbnailUpdate) {
      updates.thumbnail_url = thumbnailUrl;
    }

    const db = adminClient();
    const item = checked(
      await db
        .from('university_videos')
        .update(updates)
        .eq('id', id)
        .select('*')
        .single(),
    );

    return Response.json({ ok: true, item });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(request: Request) {
  try {
    await guard(request, 'write');
    const { id } = z.object({ id: z.string().uuid() }).parse(await request.json());

    const db = adminClient();
    checked(await db.from('university_videos').delete().eq('id', id));

    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
