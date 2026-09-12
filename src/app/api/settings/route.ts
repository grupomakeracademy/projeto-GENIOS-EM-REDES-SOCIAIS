import { z } from 'zod';
import { cookies } from 'next/headers';
import { guard, checked, fail, AppError } from '@/lib/security/context';
import { configSchema } from '@/lib/domain';
import { credentialStatus } from '@/lib/ai/credentials';
import { openAIModels, effectiveConfigs } from '@/lib/ai/defaults';
import type { AIConfig } from '@/lib/domain';
export async function GET(request: Request) {
  try {
    const ctx = await guard(request);
    const configs = checked(
      await ctx.db
        .from('ai_provider_configs')
        .select('purpose,provider,model')
        .eq('workspace_id', ctx.workspaceId),
    );
    return Response.json(
      {
        configs: effectiveConfigs(configs as AIConfig[]),
        credentials: ctx.role === 'ADMIN' ? credentialStatus() : null,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return fail(e);
  }
}
import { adminClient } from '@/lib/supabase/server';
import { validateFile } from '@/lib/security/uploads';

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const ctx = await guard(request, 'read');
      const form = await request.formData();
      const file = form.get('avatar');
      if (!(file instanceof File)) throw new AppError('invalid_input');
      if (file.size > 5 * 1024 * 1024) throw new AppError('file_too_large');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const ext = validateFile(bytes, file.type);
      const path = `workspace/${ctx.workspaceId}/avatars/${ctx.user.id}.${ext}`;
      const db = adminClient();
      await db.storage
        .from('brand-assets')
        .upload(path, bytes, { contentType: file.type, upsert: true });
      const signed = await db.storage.from('brand-assets').createSignedUrl(path, 315360000);
      const avatarUrl = signed.data?.signedUrl || '';
      await ctx.db.auth.updateUser({ data: { avatar_url: avatarUrl } });
      const current = checked(
        await ctx.db.from('profiles').select('onboarding_draft').eq('id', ctx.user.id).maybeSingle(),
      );
      await ctx.db
        .from('profiles')
        .update({
          onboarding_draft: {
            ...((current?.onboarding_draft as Record<string, unknown>) || {}),
            avatar_url: avatarUrl,
          },
        })
        .eq('id', ctx.user.id);
      return Response.json({ ok: true, avatar_url: avatarUrl });
    }

    const raw = await request.json();
    const ctx = await guard(
      request,
      ['profile', 'password', 'workspace_select', 'avatar', 'remove_avatar'].includes(raw.action)
        ? 'read'
        : 'admin',
    );
    if (raw.action === 'avatar') {
      const { avatar_url } = z.object({ avatar_url: z.string().url().max(1000) }).parse(raw);
      await ctx.db.auth.updateUser({ data: { avatar_url } });
      const current = checked(
        await ctx.db.from('profiles').select('onboarding_draft').eq('id', ctx.user.id).maybeSingle(),
      );
      await ctx.db
        .from('profiles')
        .update({
          onboarding_draft: {
            ...((current?.onboarding_draft as Record<string, unknown>) || {}),
            avatar_url,
          },
        })
        .eq('id', ctx.user.id);
      return Response.json({ ok: true, avatar_url });
    } else if (raw.action === 'remove_avatar') {
      await ctx.db.auth.updateUser({ data: { avatar_url: '' } });
      const current = checked(
        await ctx.db.from('profiles').select('onboarding_draft').eq('id', ctx.user.id).maybeSingle(),
      );
      await ctx.db
        .from('profiles')
        .update({
          onboarding_draft: {
            ...((current?.onboarding_draft as Record<string, unknown>) || {}),
            avatar_url: '',
          },
        })
        .eq('id', ctx.user.id);
      return Response.json({ ok: true, avatar_url: '' });
    } else if (raw.action === 'credential') {
      throw new AppError('forbidden', 403);
    } else if (raw.action === 'models') {
      const configs = z.array(configSchema).max(4).parse(raw.configs);
      for (const config of configs) {
        const model = checked(
          await ctx.db
            .from('ai_model_registry')
            .select('capabilities')
            .eq('workspace_id', ctx.workspaceId)
            .eq('provider', config.provider)
            .eq('model_id', config.model)
            .eq('enabled', true)
            .eq('deprecated', false)
            .maybeSingle(),
        );
        if (
          !model?.capabilities.includes(config.purpose) &&
          !openAIModels().some(
            (d) =>
              d.provider === config.provider &&
              d.model === config.model &&
              d.purpose === config.purpose,
          )
        )
          throw new AppError('unsupported_capability');
      }
      checked(
        await ctx.db.from('ai_provider_configs').upsert(
          configs.map((c) => ({ ...c, workspace_id: ctx.workspaceId })),
          { onConflict: 'workspace_id,purpose' },
        ),
      );
    } else if (raw.action === 'profile') {
      const profile = z
        .object({
          name: z.string().max(160),
          locale: z.enum(['pt-BR', 'en-US', 'es-ES']),
          avatar_url: z.string().optional(),
        })
        .parse(raw);
      checked(
        await ctx.db
          .from('profiles')
          .upsert({ id: ctx.user.id, name: profile.name, locale: profile.locale }),
      );
      if (profile.avatar_url !== undefined) {
        await ctx.db.auth.updateUser({ data: { avatar_url: profile.avatar_url } });
        const current = checked(
          await ctx.db.from('profiles').select('onboarding_draft').eq('id', ctx.user.id).maybeSingle(),
        );
        await ctx.db
          .from('profiles')
          .update({
            onboarding_draft: {
              ...((current?.onboarding_draft as Record<string, unknown>) || {}),
              avatar_url: profile.avatar_url,
            },
          })
          .eq('id', ctx.user.id);
      }
      (await cookies()).set('locale', profile.locale, {
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      });
    } else if (raw.action === 'password') {
      const { password } = z.object({ password: z.string().min(12).max(128) }).parse(raw);
      const { error } = await ctx.db.auth.updateUser({ password });
      if (error) throw new AppError('authentication_error');
    } else if (raw.action === 'workspace_select') {
      const { id } = z.object({ id: z.uuid() }).parse(raw);
      const membership = checked(
        await ctx.db
          .from('workspace_members')
          .select('workspace_id')
          .eq('workspace_id', id)
          .eq('user_id', ctx.user.id)
          .maybeSingle(),
      );
      if (!membership) throw new AppError('forbidden', 403);
      (await cookies()).set('workspace', id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      });
    } else if (raw.action === 'company') {
      const { name, timezone } = z
        .object({ name: z.string().trim().min(2).max(160), timezone: z.string().min(2) })
        .parse(raw);
      try {
        new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
      } catch {
        throw new AppError('invalid_timezone');
      }
      checked(await ctx.db.from('workspaces').update({ name, timezone }).eq('id', ctx.workspaceId));
    } else throw new AppError('invalid_input');
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
