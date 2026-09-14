import { z } from 'zod';
import { contentList } from '@/features/content/queries';
import { guard, fail, AppError } from '@/lib/security/context';
import { channels, channelSchema } from '@/lib/domain';
import { requireAgent } from '@/lib/security/agent';
import { adminClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    return Response.json(await contentList(Object.fromEntries(new URL(request.url).searchParams)));
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await guard(request, 'write');
    const body = z
      .object({
        agent_id: z.string().uuid(),
        instruction: z.string().max(10000).default(''),
        image_style: z.string().max(120).optional(),
        image_quality: z.enum(['low', 'medium', 'high']).optional(),
        is_carousel: z.boolean().optional(),
        cta: z.string().max(500).optional(),
        channels: z.array(channelSchema).min(1),
        image_count: z.number().int().min(1).max(6).default(2),
        status: z.enum(['DRAFT']).default('DRAFT'),
      })
      .parse(await request.json());

    await requireAgent(ctx, body.agent_id);

    if (body.image_count <= 1) {
      body.is_carousel = false;
    }

    const topic = body.instruction.trim() || 'Novo rascunho de conteúdo';
    const strategy = {
      image_style: body.image_style || 'Disney / Pixar',
      image_quality: body.image_quality || 'low',
      is_carousel: body.image_count >= 2 ? (body.is_carousel ?? false) : false,
      cta: body.cta || '',
      channels: body.channels,
      image_count: body.image_count,
      instruction: body.instruction.trim(),
    };

    const db = adminClient();

    const { data: item, error: itemError } = await db
      .from('content_items')
      .insert({
        workspace_id: ctx.workspaceId,
        agent_id: body.agent_id,
        topic,
        strategy,
        status: 'DRAFT',
        created_by: ctx.user.id,
      })
      .select('id')
      .single();

    if (itemError || !item) {
      throw new AppError(itemError?.message || 'database_error', 500);
    }

    const variants = body.channels.map((ch) => ({
      workspace_id: ctx.workspaceId,
      content_id: item.id,
      channel: ch,
      title: topic.slice(0, 120),
      caption: '',
      cta: body.cta || '',
      aspect_ratio: channels[ch]?.ratio || '4:5',
      image_prompts: [],
    }));

    const { error: varError } = await db.from('content_variants').insert(variants);
    if (varError) {
      throw new AppError(varError.message || 'database_error', 500);
    }

    await db.from('content_events').insert({
      workspace_id: ctx.workspaceId,
      content_id: item.id,
      actor: ctx.user.id,
      event: 'CONTENT_CREATED',
      metadata: { status: 'DRAFT', channels: body.channels },
    });

    return Response.json({ id: item.id, status: 'DRAFT' });
  } catch (e) {
    return fail(e);
  }
}
