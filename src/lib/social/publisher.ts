import 'server-only';
import { adminClient } from '@/lib/supabase/server';
import { checked, required } from '@/lib/security/context';
import { decrypt } from '@/lib/security/crypto';
import { connectors, type PublishResult } from './connectors';
import type { Channel, Destination } from '@/lib/domain';

export async function publishVariantContent(params: {
  workspaceId: string;
  contentId: string;
  variantId?: string;
  actorId?: string;
  destination?: Destination;
}): Promise<PublishResult[]> {
  const db = adminClient();
  const { workspaceId, contentId, variantId, actorId } = params;

  // 1. Carregar item de conteúdo
  const item = required(
    await db
      .from('content_items')
      .select('id, agent_id, topic, status, version, strategy')
      .eq('id', contentId)
      .eq('workspace_id', workspaceId)
      .single(),
  );

  // 2. Carregar variantes
  let variantsQuery = db
    .from('content_variants')
    .select('id, channel, caption, status')
    .eq('content_id', contentId)
    .eq('workspace_id', workspaceId);

  if (variantId) {
    variantsQuery = variantsQuery.eq('id', variantId);
  }

  const variants = checked(await variantsQuery);
  if (!variants || variants.length === 0) {
    throw new Error('variant_not_found');
  }

  const results: PublishResult[] = [];

  for (const variant of variants) {
    const channel = variant.channel as Channel;
    const connector = connectors[channel];
    if (!connector) {
      throw new Error(`unsupported_channel: ${channel}`);
    }

    // 3. Buscar mídias associadas (imagens) ordenadas por posição
    const medias = checked(
      await db
        .from('content_media')
        .select('storage_path, position')
        .eq('variant_id', variant.id)
        .eq('workspace_id', workspaceId)
        .order('position', { ascending: true }),
    );

    // 4. Gerar URLs assinadas públicas temporárias (1 hora) para as imagens
    const mediaUrls: string[] = [];
    for (const m of medias || []) {
      const { data: signed, error: signErr } = await db.storage
        .from('brand-assets')
        .createSignedUrl(m.storage_path, 3600);

      if (!signErr && signed?.signedUrl) {
        mediaUrls.push(signed.signedUrl);
      }
    }

    // 5. Buscar conexão social ativa para este canal
    // Primeiro tenta pelo agente específico, depois em nível de workspace
    let connection = checked(
      await db
        .from('social_connections')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('agent_id', item.agent_id)
        .eq('channel', channel)
        .maybeSingle(),
    );

    if (!connection) {
      connection = checked(
        await db
          .from('social_connections')
          .select('*')
          .eq('workspace_id', workspaceId)
          .eq('channel', channel)
          .maybeSingle(),
      );
    }

    if (!connection) {
      throw new Error(`channel_not_connected: ${channel}`);
    }

    // 6. Decriptografar token com segurança
    let token = connection.token_ciphertext || 'demo_connected';
    if (token.includes('.')) {
      try {
        token = decrypt(token, workspaceId);
      } catch {
        // Se a chave não for válida ou for token legado, usa o valor original
      }
    }

    const itemStrategy = (item.strategy && typeof item.strategy === 'object' ? item.strategy : {}) as Record<string, unknown>;
    const effectiveDestination = (params.destination || itemStrategy.destination || 'feed') as Destination;
    const caps = connector.capabilities();
    let destinationForChannel: Destination = effectiveDestination;
    if (!caps.canPublishStories) {
      destinationForChannel = 'feed';
    }

    // 7. Executar a publicação no conector da rede
    const result = await connector.publish({
      caption: variant.caption || item.topic || '',
      mediaUrls,
      channel,
      accountName: connection.account_name,
      token,
      externalId: connection.external_id,
      metadata: connection.metadata,
      destination: destinationForChannel,
    });

    results.push(result);

    // 8. Atualizar status da variante e registrar evento
    const now = new Date().toISOString();
    checked(
      await db
        .from('content_variants')
        .update({
          status: 'PUBLISHED',
          published_at: now,
        })
        .eq('id', variant.id)
        .eq('content_id', contentId),
    );

    // Registrar evento de auditoria
    checked(
      await db.from('content_events').insert({
        workspace_id: workspaceId,
        content_id: contentId,
        actor: actorId || null,
        event: 'PUBLISH',
        metadata: {
          variant_id: variant.id,
          channel,
          destination: destinationForChannel,
          external_post_id: result.externalPostId,
          external_post_url: result.externalPostUrl,
        },
      }),
    );
  }

  // Persistir destino no item de conteúdo se fornecido e diferente
  if (params.destination) {
    const currentStrat = (item.strategy && typeof item.strategy === 'object' ? item.strategy : {}) as Record<string, unknown>;
    if (currentStrat.destination !== params.destination) {
      checked(
        await db
          .from('content_items')
          .update({
            strategy: {
              ...currentStrat,
              destination: params.destination,
            },
          })
          .eq('id', contentId)
          .eq('workspace_id', workspaceId),
      );
    }
  }

  // 9. Atualizar o item de conteúdo principal para PUBLISHED se todas as variantes estiverem publicadas
  const remainingVariants = checked(
    await db
      .from('content_variants')
      .select('id')
      .eq('content_id', contentId)
      .eq('workspace_id', workspaceId)
      .neq('status', 'PUBLISHED')
      .limit(1),
  );

  if (!remainingVariants || remainingVariants.length === 0) {
    checked(
      await db
        .from('content_items')
        .update({
          status: 'PUBLISHED',
          updated_at: new Date().toISOString(),
        })
        .eq('id', contentId)
        .eq('workspace_id', workspaceId),
    );
  }

  return results;
}
