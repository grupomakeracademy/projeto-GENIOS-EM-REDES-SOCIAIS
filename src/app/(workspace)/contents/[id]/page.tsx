import { notFound } from 'next/navigation';
import { z } from 'zod';
import { context, checked, required } from '@/lib/security/context';
import { adminClient } from '@/lib/supabase/server';
import { ContentDetail } from '@/features/content/detail';
import type { Content, Agent } from '@/lib/domain';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await context();
  const item = checked(
    await ctx.db
      .from('content_items')
      .select('*,content_variants(*,content_media(*))')
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId)
      .maybeSingle(),
  ) as Content | null;
  if (!item) notFound();
  if (!(item.strategy as Record<string, unknown>)?.instruction) {
    const job = await ctx.db.from('background_jobs').select('payload').eq('id', id).maybeSingle();
    const payload = (job.data?.payload as Record<string, unknown>) || {};
    if (payload.instruction || payload.image_style || payload.cta || payload.is_carousel !== undefined) {
      item.strategy = {
        ...(item.strategy || {}),
        instruction: (item.strategy as Record<string, unknown>)?.instruction || payload.instruction || '',
        image_style: (item.strategy as Record<string, unknown>)?.image_style || payload.image_style || '',
        is_carousel: (item.strategy as Record<string, unknown>)?.is_carousel ?? payload.is_carousel ?? false,
        cta: (item.strategy as Record<string, unknown>)?.cta || payload.cta || '',
      };
    }
  }
  for (const variant of item.content_variants)
    for (const media of variant.content_media) {
      media.url = (
        await ctx.db.storage.from('brand-assets').createSignedUrl(mediaDisplaySource(media.storage_path), 900)
      ).data?.signedUrl;
    }
  const events = checked(
    await ctx.db
      .from('content_events')
      .select('id,event,created_at,metadata')
      .eq('content_id', id)
      .eq('workspace_id', ctx.workspaceId)
      .order('created_at', { ascending: false })
      .limit(50),
  );
  const [companyRes, connectionsRes, agentsRes, wsSettings] = await Promise.all([
    ctx.db.from('workspaces').select('name,timezone').eq('id', ctx.workspaceId).single(),
    adminClient()
      .from('social_connections')
      .select('id,agent_id,channel,account_name,created_at')
      .eq('workspace_id', ctx.workspaceId),
    ctx.db.from('agents').select('*').eq('workspace_id', ctx.workspaceId).limit(100),
    ctx.db.from('workspace_settings').select('settings').eq('workspace_id', ctx.workspaceId).maybeSingle(),
  ]);
  const company = required(companyRes);
  const connections = connectionsRes.data || [];
  const agents = (agentsRes.data || []) as Agent[];
  const globalQ = (checked(wsSettings)?.settings as Record<string, string>)?.image_quality;
  const defaultImageQuality = globalQ === 'medium' ? 'medium' : 'low';

  return (
    <ContentDetail
      initial={item}
      company={company.name}
      timezone={company.timezone}
      canEdit={ctx.role !== 'VIEWER'}
      events={events || []}
      connections={connections}
      agents={agents}
      defaultImageQuality={defaultImageQuality}
    />
  );
}
import { mediaDisplaySource } from '@/lib/media-display-source';
