import 'server-only';
import { z } from 'zod';
import crypto from 'node:crypto';
import { adminClient } from '@/lib/supabase/server';
import { serverCredential } from '@/lib/ai/credentials';
import { apiJSON, openAISchema } from '@/lib/ai/providers';
import type { Agent } from '@/lib/domain';

export const visualReferenceInterpretationSchema = z.object({
  reference_type: z.enum([
    'logo',
    'mascot',
    'character',
    'style_guide',
    'color_palette',
    'product',
    'scenery',
    'typography',
    'general_reference',
  ]),
  title: z.string().describe('Título curto e descritivo da referência'),
  visual_description: z.string().describe('Descrição visual aprofundada da cena e dos elementos'),
  composition_and_framing: z.string().describe('Enquadramento, perspectiva e composição'),
  art_style: z.string().describe('Direção artística, traço e estilo estético (ex: 3D Pixar, fotografia minimalista, flat design)'),
  brand_identity_and_mood: z.string().describe('Identidade da marca, emoção e atmosfera transmitida'),
  predominant_colors: z.array(z.string()).describe('Lista das cores predominantes com nomes ou códigos'),
  typography_style: z.string().describe('Estilo tipográfico percebido ou "Nenhuma"'),
  characters_and_mascots: z.string().describe('Detalhes anatômicos, roupas, cores, traços e poses dos personagens ou mascotes'),
  logos_and_symbols: z.string().describe('Elementos de logotipo ou símbolos de marca presentes'),
  mandatory_elements: z.array(z.string()).describe('Elementos visuais mandatórios a preservar'),
  elements_to_avoid: z.array(z.string()).describe('Elementos visuais a evitar'),
  generation_guidelines: z.string().describe('Instruções diretas para o modelo de geração de imagem reproduzir a essência visual'),
});

export type VisualReferenceInterpretation = z.infer<typeof visualReferenceInterpretationSchema>;

export const documentReferenceInterpretationSchema = z.object({
  reference_type: z.enum([
    'style_guide',
    'brand_manual',
    'copywriting_guidelines',
    'product_spec',
    'general_document',
  ]),
  title: z.string().describe('Título do documento ou referência textual'),
  brand_guidelines: z.string().describe('Diretrizes e posicionamento de marca extraídos'),
  tone_of_voice: z.string().describe('Tom de voz editorial e personalidade'),
  mandatory_elements: z.array(z.string()).describe('Regras mandatórias e elementos que devem constar'),
  elements_to_avoid: z.array(z.string()).describe('Pontos expressamente proibidos ou a evitar'),
  visual_instructions: z.string().describe('Instruções visuais ou estéticas mencionadas'),
  key_takeaways: z.string().describe('Resumo executivo do conteúdo para geração'),
});

export type DocumentReferenceInterpretation = z.infer<typeof documentReferenceInterpretationSchema>;

/**
 * Computes SHA-256 hash for binary content.
 */
export function computeContentHash(buffer: Buffer | Uint8Array): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Builds a dense, prompt-optimized summary from visual interpretation.
 */
export function buildVisualSummaryText(interp: VisualReferenceInterpretation): string {
  const parts = [
    `[DNA VISUAL: ${interp.title} (${interp.reference_type})]`,
    `Estilo Artístico: ${interp.art_style}.`,
    `Identidade e Clima: ${interp.brand_identity_and_mood}.`,
    interp.characters_and_mascots && interp.characters_and_mascots !== 'Nenhum' && interp.characters_and_mascots !== 'None'
      ? `Personagens/Mascotes: ${interp.characters_and_mascots}.`
      : '',
    interp.predominant_colors?.length ? `Cores Mandatórias: ${interp.predominant_colors.join(', ')}.` : '',
    interp.logos_and_symbols && interp.logos_and_symbols !== 'Nenhum' && interp.logos_and_symbols !== 'None'
      ? `Símbolos/Logos: ${interp.logos_and_symbols}.`
      : '',
    interp.mandatory_elements?.length ? `Elementos Obrigatórios: ${interp.mandatory_elements.join('; ')}.` : '',
    interp.elements_to_avoid?.length ? `A Evitar: ${interp.elements_to_avoid.join('; ')}.` : '',
    `Diretriz de Geração: ${interp.generation_guidelines}`,
  ].filter(Boolean);
  return parts.join(' ');
}

/**
 * Builds summary text from document/textual reference interpretation.
 */
export function buildDocumentSummaryText(interp: DocumentReferenceInterpretation): string {
  const parts = [
    `[DOCUMENTO DE MARCA: ${interp.title} (${interp.reference_type})]`,
    `Diretrizes: ${interp.brand_guidelines}.`,
    `Tom de Voz: ${interp.tone_of_voice}.`,
    interp.visual_instructions ? `Instruções Visuais: ${interp.visual_instructions}.` : '',
    interp.mandatory_elements?.length ? `Regras Obrigatórias: ${interp.mandatory_elements.join('; ')}.` : '',
    interp.elements_to_avoid?.length ? `Evitar: ${interp.elements_to_avoid.join('; ')}.` : '',
    `Síntese: ${interp.key_takeaways}`,
  ].filter(Boolean);
  return parts.join(' ');
}

export interface ProcessAssetResult {
  assetId: string;
  status: 'processed' | 'deduplicated' | 'already_processed' | 'failed';
  summaryText?: string;
  error?: string;
  visionCallsMade: number;
}

/**
 * Processes a single asset into the textual knowledge base.
 * Guarantees that vision API is called AT MOST ONCE per distinct file (deduplicated by SHA-256).
 */
export async function processAssetKnowledge(
  assetId: string,
  options?: { force?: boolean; preloadedBytes?: Buffer | Uint8Array },
): Promise<ProcessAssetResult> {
  const db = adminClient();

  const { data: asset, error: fetchErr } = await db
    .from('assets')
    .select('id, workspace_id, name, mime_type, storage_path, content_hash, processing_status, textual_interpretation, summary_text')
    .eq('id', assetId)
    .maybeSingle();

  if (fetchErr || !asset) {
    return {
      assetId,
      status: 'failed',
      error: fetchErr?.message || 'asset_not_found',
      visionCallsMade: 0,
    };
  }

  // If already processed and not forced, reuse existing
  if (!options?.force && asset.processing_status === 'processed' && asset.summary_text) {
    return {
      assetId,
      status: 'already_processed',
      summaryText: asset.summary_text,
      visionCallsMade: 0,
    };
  }

  try {
    // 1. Obtain file bytes and compute hash
    let buffer: Buffer;
    if (options?.preloadedBytes) {
      buffer = Buffer.from(options.preloadedBytes);
    } else {
      const download = await db.storage.from('brand-assets').download(asset.storage_path);
      if (download.error || !download.data) {
        throw new Error(`storage_download_failed: ${download.error?.message || 'empty data'}`);
      }
      buffer = Buffer.from(await download.data.arrayBuffer());
    }

    const hash = computeContentHash(buffer);

    // 2. Check if identical content was already processed in the workspace/system
    if (!options?.force) {
      const { data: existingProcessed } = await db
        .from('assets')
        .select('textual_interpretation, summary_text, processor_model, processing_version')
        .eq('content_hash', hash)
        .eq('processing_status', 'processed')
        .not('summary_text', 'is', null)
        .neq('id', asset.id)
        .limit(1)
        .maybeSingle();

      if (existingProcessed?.summary_text) {
        // Delta deduplication: copy interpretation directly (0 API calls!)
        await db
          .from('assets')
          .update({
            content_hash: hash,
            processing_status: 'processed',
            processing_error: null,
            processed_at: new Date().toISOString(),
            processor_model: existingProcessed.processor_model,
            processing_version: existingProcessed.processing_version || 1,
            textual_interpretation: existingProcessed.textual_interpretation,
            summary_text: existingProcessed.summary_text,
          })
          .eq('id', asset.id);

        console.log(`[Asset Knowledge] Reused interpretation for asset "${asset.name}" via hash ${hash.slice(0, 8)} (0 API calls).`);
        return {
          assetId,
          status: 'deduplicated',
          summaryText: existingProcessed.summary_text,
          visionCallsMade: 0,
        };
      }
    }

    // Mark as processing
    await db
      .from('assets')
      .update({
        content_hash: hash,
        processing_status: 'processing',
        processing_error: null,
      })
      .eq('id', asset.id);

    const isImage = asset.mime_type.startsWith('image/');
    const openAIKey = serverCredential('openai');
    if (!openAIKey) throw new Error('openai_credential_missing');

    let interpretation: VisualReferenceInterpretation | DocumentReferenceInterpretation;
    let summaryText: string;
    const model = process.env.OPENAI_VISION_MODEL || 'gpt-4o';

    if (isImage) {
      // 3. Single Vision Call for images
      const base64 = buffer.toString('base64');
      const systemPrompt =
        'Você é o especialista sênior em direção de arte e identidade visual do sistema Gênios para Redes Sociais. Sua função é analisar detalhadamente imagens de referência da Biblioteca de Marca (logos, mascotes, fotos de produtos, ilustrações, guias de estilo) e extrair todo o seu DNA visual em formato estruturado. O texto que você produzir será utilizado diretamente por geradores de imagem para reproduzir com máxima fidelidade o estilo, personagens, cores e identidade da marca SEM precisar reenviar a imagem original. Retorne exclusivamente o JSON especificado.';

      const userContent = [
        {
          type: 'text',
          text: `Analise a referência visual "${asset.name}" e extraia o DNA visual completo para permitir futuras gerações fiéis sem necessidade de reinterpretação visual.`,
        },
        {
          type: 'image_url',
          image_url: {
            url: `data:${asset.mime_type};base64,${base64}`,
            detail: 'high',
          },
        },
      ];

      const raw = await apiJSON(
        'https://api.openai.com/v1/chat/completions',
        openAIKey,
        {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'visual_reference_interpretation',
              strict: true,
              schema: openAISchema(visualReferenceInterpretationSchema),
            },
          },
        },
        'openai',
      );

      const parsedResponse = z
        .object({
          choices: z.array(
            z.object({
              message: z.object({
                content: z.string().nullable(),
              }),
            }),
          ),
        })
        .parse(raw);

      const contentStr = parsedResponse.choices[0]?.message.content;
      if (!contentStr) throw new Error('empty_vision_response');

      const parsed = visualReferenceInterpretationSchema.parse(JSON.parse(contentStr));
      interpretation = parsed;
      summaryText = buildVisualSummaryText(parsed);
    } else {
      // 4. Text/Document normalization
      const textContent = buffer.toString('utf-8').slice(0, 15000);
      const docSystemPrompt =
        'Você é o especialista em estratégia de conteúdo do sistema Gênios para Redes Sociais. Analise este documento da biblioteca de marca e extraia as diretrizes essenciais de tom de voz, regras e identidade textual em formato estruturado.';

      const raw = await apiJSON(
        'https://api.openai.com/v1/chat/completions',
        openAIKey,
        {
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: docSystemPrompt },
            {
              role: 'user',
              content: `Documento: ${asset.name}\n\nConteúdo:\n${textContent}`,
            },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'document_reference_interpretation',
              strict: true,
              schema: openAISchema(documentReferenceInterpretationSchema),
            },
          },
        },
        'openai',
      );

      const parsedResponse = z
        .object({
          choices: z.array(
            z.object({
              message: z.object({
                content: z.string().nullable(),
              }),
            }),
          ),
        })
        .parse(raw);

      const contentStr = parsedResponse.choices[0]?.message.content;
      if (!contentStr) throw new Error('empty_document_response');

      const parsed = documentReferenceInterpretationSchema.parse(JSON.parse(contentStr));
      interpretation = parsed;
      summaryText = buildDocumentSummaryText(parsed);
    }

    // 5. Persist the knowledge representation
    await db
      .from('assets')
      .update({
        content_hash: hash,
        processing_status: 'processed',
        processing_error: null,
        processed_at: new Date().toISOString(),
        processor_model: model,
        processing_version: 1,
        textual_interpretation: interpretation,
        summary_text: summaryText,
      })
      .eq('id', asset.id);

    console.log(`[Asset Knowledge] Successfully processed asset "${asset.name}" (${asset.id}). 1 vision call made.`);

    return {
      assetId,
      status: 'processed',
      summaryText,
      visionCallsMade: isImage ? 1 : 0,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Asset Knowledge] Failed processing asset ${assetId}:`, errorMsg);

    await db
      .from('assets')
      .update({
        processing_status: 'failed',
        processing_error: errorMsg.slice(0, 500),
      })
      .eq('id', assetId);

    return {
      assetId,
      status: 'failed',
      error: errorMsg,
      visionCallsMade: 0,
    };
  }
}

/**
 * Retrieves and consolidates textual visual knowledge for an Agent.
 * Replaces the old `references(agent)` function that downloaded binary images.
 * Returns a rich textual context block to be injected into the prompt,
 * guaranteeing 0 vision token consumption during normal image generation.
 */
export async function getAgentVisualKnowledge(agent: Agent): Promise<string> {
  const rawIds = Array.isArray(agent.visual_settings.reference_ids)
    ? agent.visual_settings.reference_ids.filter(
        (id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id),
      )
    : [];

  const ids = rawIds.slice(0, 10);
  if (!ids.length) return '';

  const db = adminClient();
  const { data: assets, error } = await db
    .from('assets')
    .select('id, name, mime_type, processing_status, summary_text, textual_interpretation')
    .in('id', ids);

  // Only use already processed knowledge summaries - ZERO automatic vision calls
  const validSummaries = (assets || [])
    .filter((a) => a.summary_text && a.processing_status === 'processed')
    .map((a) => `• ${a.name}: ${a.summary_text}`);

  if (!validSummaries.length) return '';

  return [
    'BASE DE CONHECIMENTO DE IDENTIDADE VISUAL DA MARCA (REFERÊNCIAS PROCESSADAS):',
    ...validSummaries,
    'DIRETRIZ GERAL: Reproduza estritamente as características cromáticas, estilo artístico, traços dos personagens/mascotes e símbolos descritos acima.',
  ].join('\n');
}
