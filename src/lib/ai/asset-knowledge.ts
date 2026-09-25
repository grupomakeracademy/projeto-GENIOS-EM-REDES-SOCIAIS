import 'server-only';
import { z } from 'zod';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { adminClient } from '@/lib/supabase/server';
import { serverCredential } from '@/lib/ai/credentials';
import { apiJSON, openAISchema } from '@/lib/ai/providers';
import type { Agent } from '@/lib/domain';
import type { ExactLogoPolicy } from './image-logo-policy';
import { assetProcessingCode } from './asset-processing-errors';
import { ProviderError } from './provider-error';

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

  let stage = 'asset_lookup';
  let visionCallsMade = 0;
  const model = process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini';
  function requireWrite(result: { error: unknown }) {
    if (result.error) {
      const code = typeof result.error === 'object' && result.error && 'code' in result.error ? String(result.error.code) : '';
      console.error('[Asset Knowledge] Database write rejected', { assetId, stage, code: /^[a-zA-Z0-9_]{1,40}$/.test(code) ? code : 'unknown' });
      throw new Error('asset_persistence_failed');
    }
  }

  const { data: asset, error: fetchErr } = await db
    .from('assets')
    .select('id, workspace_id, name, category, mime_type, storage_path, content_hash, processing_status, textual_interpretation, summary_text')
    .eq('id', assetId)
    .maybeSingle();

  if (fetchErr || !asset) {
    return {
      assetId,
      status: 'failed',
      error: fetchErr ? 'asset_persistence_failed' : 'asset_not_found',
      visionCallsMade: 0,
    };
  }

  // Categories that use raw original files directly (never consume vision/AI API tokens)
  if (asset.category === 'protected_identity' || asset.category === 'exact_asset') {
    return {
      assetId,
      status: 'already_processed',
      summaryText: 'Ativo de arquivo direto (não requer interpretação de visão ou IA).',
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
    stage = 'storage_download';
    // 1. Obtain file bytes and compute hash
    let buffer: Buffer;
    if (options?.preloadedBytes) {
      buffer = Buffer.from(options.preloadedBytes);
    } else {
      const download = await db.storage.from('brand-assets').download(asset.storage_path);
      if (download.error || !download.data) {
        throw new Error('storage_download_failed');
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
        stage = 'persist_deduplicated';
        requireWrite(await db
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
          .eq('id', asset.id));

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
    stage = 'mark_processing';
    requireWrite(await db
      .from('assets')
      .update({
        content_hash: hash,
        processing_status: 'processing',
        processing_error: null,
      })
      .eq('id', asset.id));

    const isImage = asset.mime_type.startsWith('image/');
    stage = 'provider_credentials';
    const openAIKey = serverCredential('openai');
    if (!openAIKey) throw new Error('openai_credential_missing');

    let interpretation: VisualReferenceInterpretation | DocumentReferenceInterpretation;
    let summaryText: string;

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

      stage = 'vision_request';
      visionCallsMade += 1;
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
        'openai', 'POST', {trigger:'user_action',source:'src/lib/ai/asset-knowledge.ts:processAssetKnowledge',reason:'reference_analysis'},
      );

      stage = 'parse_vision_response';
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
      if (!contentStr) throw new Error('invalid_output');

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
        'openai', 'POST', {trigger:'user_action',source:'src/lib/ai/asset-knowledge.ts:processAssetKnowledge',reason:'document_analysis'},
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
    stage = 'persist_result';
    requireWrite(await db
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
      .eq('id', asset.id));

    console.log(`[Asset Knowledge] Successfully processed asset "${asset.name}" (${asset.id}). 1 vision call made.`);

    return {
      assetId,
      status: 'processed',
      summaryText,
      visionCallsMade: isImage ? 1 : 0,
    };
  } catch (err) {
    const errorMsg = assetProcessingCode(err);
    console.error('[Asset Knowledge] Processing failed', { assetId, workspaceId: asset.workspace_id,
      category: asset.category, mimeType: asset.mime_type, model, stage, code: errorMsg,
      ...(err instanceof ProviderError ? { provider: err.diagnostic } : {}) });

    const failureWrite = await db
      .from('assets')
      .update({
        processing_status: 'failed',
        processing_error: errorMsg.slice(0, 500),
      })
      .eq('id', assetId);
    if (failureWrite.error) console.error('[Asset Knowledge] Failed to persist failure status', { assetId, stage });

    return {
      assetId,
      status: 'failed',
      error: errorMsg,
      visionCallsMade,
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
  const rawIds = Array.isArray(agent.visual_settings?.reference_ids)
    ? (agent.visual_settings.reference_ids as string[]).filter(
        (id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id),
      )
    : [];

  const ids = rawIds.slice(0, 10);
  if (!ids.length) return '';

  const db = adminClient();
  const { data: assets } = await db
    .from('assets')
    .select(
      'id, name, category, identity_name, identity_type, is_master, asset_subtype, placement, mime_type, processing_status, summary_text, textual_interpretation',
    )
    .in('id', ids);

  if (!assets || !assets.length) return '';

  const validSummaries: string[] = [];
  let hasExact = false;

  for (const a of assets) {
    if (a.category === 'exact_asset') {
      hasExact = true;
      validSummaries.push(
        `• [ASSET EXATO - ${a.name} (${a.asset_subtype || 'Logo'})]: Arquivo oficial da marca. REGRA OBRIGATÓRIA: NÃO desenhar, recriar nem tentar gerar este logotipo na imagem via IA. Ele será aplicado exclusivamente em pós-produção com fidelidade e proporção original intactas. Mantenha a área (${a.placement || 'top_left'}) completamente limpa e desobstruída.`,
      );
    } else if (a.category === 'protected_identity') {
      const role = a.is_master ? 'REFERÊNCIA MESTRE' : 'Variação secundária';
      validSummaries.push(
        `• [IDENTIDADE PROTEGIDA (${role}) - ${a.identity_name || a.name}]: ${a.summary_text || 'Identidade visual cadastrada para uso na cena.'}`,
      );
    } else if (a.summary_text && a.processing_status === 'processed') {
      validSummaries.push(`• [REFERÊNCIA DE ESTILO - ${a.name}]: ${a.summary_text}`);
    }
  }

  if (!validSummaries.length) return '';

  const lines = [
    'BASE DE CONHECIMENTO DE IDENTIDADE VISUAL DA MARCA (REFERÊNCIAS PROCESSADAS):',
    ...validSummaries,
    'DIRETRIZ GERAL: Reproduza estritamente as características cromáticas, estilo artístico e traços visuais dos elementos descritos acima.',
  ];

  if (hasExact) {
    lines.push(
      'REGRA MANDATÓRIA DE ASSET EXATO (LOGOTIPO): Jamais gere logotipo, texto de marca ou selos na cena. O logotipo original exato é sobreposto em pós-produção.',
    );
  }

  return lines.join('\n');
}

export interface VisualReferenceInput {
  mimeType: string;
  data: string; // base64
  identityName?: string;
  assetId?: string;
}


export function matchIdentityInScene(
  scenePrompt: string,
  identityName?: string | null,
  _identityType?: string | null,
): boolean {
  const sceneText = (scenePrompt || '').toLowerCase();
  const name = (identityName || '').toLowerCase().trim();

  if (!name) return false;
  if (sceneText.includes(name)) return true;

  // Match individual significant words (>= 3 chars) of the identity name
  const words = name
    .split(/[\s,._-]+/)
    .filter((w) => w.length >= 3 && !['com', 'para', 'dos', 'das', 'uma', 'seu', 'sua', 'the', 'and'].includes(w));
  return words.some((w) => sceneText.includes(w));
}

/**
 * Composites an exact asset (logo/badge/watermark) onto a base image using sharp.
 */
export async function compositeExactAssetBuffer(
  baseImage: Buffer | Uint8Array,
  overlayBytes: Buffer | Uint8Array,
  placement: string = 'top_left',
  scalePercent: number = 20,
): Promise<Buffer> {
  const baseImg = sharp(baseImage);
  const metadata = await baseImg.metadata();
  const width = metadata.width || 1024;
  const height = metadata.height || 1024;

  let processedOverlay: Buffer = Buffer.isBuffer(overlayBytes) ? overlayBytes : Buffer.from(overlayBytes);
  let originalAssetWidth = 0;
  let originalAssetHeight = 0;

  try {
    const rawOverlayMeta = await sharp(overlayBytes).metadata();
    originalAssetWidth = rawOverlayMeta.width || 0;
    originalAssetHeight = rawOverlayMeta.height || 0;
    // Trim empty transparent padding (e.g. from Canva/Figma exports) so the visible artwork
    processedOverlay = Buffer.isBuffer(overlayBytes) ? overlayBytes : Buffer.from(overlayBytes);
  } catch {
    processedOverlay = Buffer.isBuffer(overlayBytes) ? overlayBytes : Buffer.from(overlayBytes);
  }

  // Proportional sizing: percentage of base image width (clamped safely between 1% and 100%, default 20%)
  const effectiveScale =
    typeof scalePercent === 'number' && !Number.isNaN(scalePercent) && scalePercent > 0
      ? Math.max(1, Math.min(100, scalePercent))
      : 20;

  const targetLogoWidth = Math.round(width * (effectiveScale / 100));

  const resizedOverlay = await sharp(processedOverlay)
    .resize({ width: targetLogoWidth })
    .toBuffer();

  const overlayMeta = await sharp(resizedOverlay).metadata();
  const computedLogoWidth = overlayMeta.width || targetLogoWidth;
  const computedLogoHeight = overlayMeta.height || targetLogoWidth;

  const marginX = Math.round(width * 0.05);
  const marginY = Math.round(height * 0.05);
  if (computedLogoWidth > width || computedLogoHeight > height) throw new Error('invalid_input');

  let left = marginX;
  let top = marginY;

  switch (placement) {
    case 'top_right':
      left = width - computedLogoWidth - marginX;
      top = marginY;
      break;
    case 'bottom_left':
      left = marginX;
      top = height - computedLogoHeight - marginY;
      break;
    case 'bottom_right':
      left = width - computedLogoWidth - marginX;
      top = height - computedLogoHeight - marginY;
      break;
    case 'top_left':
    default:
      left = marginX;
      top = marginY;
      break;
  }

  // Ensure overlay fits within canvas boundaries
  left = Math.max(0, Math.min(width - computedLogoWidth, left));
  top = Math.max(0, Math.min(height - computedLogoHeight, top));

  // Technical diagnostic logs for auditability without paid API calls
  console.log('[Exact Asset Compositing]', {
    finalImageWidth: width,
    finalImageHeight: height,
    scalePercent: effectiveScale,
    originalAssetWidth,
    originalAssetHeight,
    targetLogoWidth,
    computedLogoWidth,
    computedLogoHeight,
    overlayPosition: placement,
    top,
    left,
    exactAssetApplied: true,
  });

  return await baseImg
    .composite([{ input: resizedOverlay, left, top }])
    .png()
    .toBuffer();
}

/**
 * Automated selection of visual references prior to image generation.
 * RULE: Smallest number of visual references possible (0 when possible, 1 when needed, NEVER all).
 * Returns only the single master reference for the identity required in the scene.
 */
export async function selectSceneVisualReferences(params: {
  agent: Agent;
  prompt: string;
  channel?: string;
  position?: number;
  workspaceId?: string;
}): Promise<VisualReferenceInput[]> {
  const wsId = params.workspaceId || params.agent.workspace_id;
  const db = adminClient();

  const rawIds = Array.isArray(params.agent.visual_settings?.reference_ids)
    ? (params.agent.visual_settings.reference_ids as string[]).filter(
        (id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id),
      )
    : [];

  let query = db
    .from('assets')
    .select('id, name, mime_type, storage_path, category, identity_name, identity_type, is_master')
    .eq('workspace_id', wsId)
    .eq('category', 'protected_identity')
    .eq('is_master', true);

  if (rawIds.length) {
    query = query.in('id', rawIds);
  }

  const { data: masters, error } = await query;
  if (error || !masters || !masters.length) {
    return [];
  }

  // Inspect which identity is strictly involved in the scene
  const matchedMasters = masters.filter((m) =>
    matchIdentityInScene(params.prompt, m.identity_name, m.identity_type),
  );

  // If scene does not require a character -> 0 visual references sent
  if (!matchedMasters.length) {
    return [];
  }

  // Strictly at most 1 master reference (never all)
  const selectedMaster = matchedMasters[0];

  try {
    const download = await db.storage.from('brand-assets').download(selectedMaster.storage_path);
    if (download.error || !download.data) {
      console.warn(`[Scene Reference Selection] Failed downloading master asset ${selectedMaster.id}:`, download.error);
      return [];
    }
    const buffer = Buffer.from(await download.data.arrayBuffer());
    return [
      {
        mimeType: selectedMaster.mime_type,
        data: buffer.toString('base64'),
        identityName: selectedMaster.identity_name || selectedMaster.name,
        assetId: selectedMaster.id,
      },
    ];
  } catch (err) {
    console.error(`[Scene Reference Selection] Error processing master visual reference:`, err);
    return [];
  }
}

/**
 * Checks if the agent has any active exact asset (like official logo) to instruct prompt generation.
 */
export async function getExactAssetPolicy(agent: Agent): Promise<ExactLogoPolicy & { guidance: string }> {
  const exactAssets = await resolveExactAssets(agent);
  const brandNames = [agent.name, ...Object.entries(agent.briefing || {})
    .filter(([key]) => /^(company|company_name|brand|brand_name|business_name|nome_empresa|nome_marca)$/i.test(key))
    .flatMap(([, value]) => typeof value === 'string' ? [value] : [])];
  if (!exactAssets || !exactAssets.length) return { hasExactLogoAsset: false, brandNames, guidance: '' };

  const hasLogo = exactAssets.some(
    (a) => !a.asset_subtype || a.asset_subtype === 'logo',
  );
  const placements = exactAssets
    .map((a) => a.placement || 'top_left')
    .filter((p) => p !== 'manual' && p !== 'none');
  const placementText = placements.length ? placements.join(', ') : 'canto reservado';

  if (hasLogo) {
    return { hasExactLogoAsset: true, brandNames, guidance: [
      'REGRA MANDATÓRIA DE MARCA — PROIBIDO GERAR LOGOTIPO:',
      '• Não desenhe, não gere, não recrie, não invente, não estilize e não alucine nenhum logotipo, nome de marca, wordmark, selo de marca, assinatura visual ou texto de marca na imagem.',
      '• Não escreva o nome da marca como elemento gráfico decorativo.',
      '• Não crie variações tipográficas da marca.',
      '• Não adicione logotipo em cantos, rodapés, embalagens, telas, objetos, cadernos, uniformes, canecas ou qualquer outro elemento da cena.',
      `• Quando a composição normalmente pedir marca visual, mantenha a área (${placementText}) completamente limpa e neutra.`,
      '• O logotipo oficial será aplicado posteriormente em pós-produção a partir do arquivo original cadastrado.',
      '• Diferenciação obrigatória: texto editorial da peça = permitido; marca / logotipo / selo / assinatura visual = terminantemente proibido para a IA.',
      '• Portanto, a imagem gerada pela IA deve sair sem nenhum logotipo ou marca embutida.',
    ].join('\n') };
  }

  return { hasExactLogoAsset: false, brandNames, guidance: [
    'REGRA MANDATÓRIA DE MARCA — ASSET EXATO:',
    '• NÃO gere elementos de marca, selos, marcas d’água ou assinaturas visuais na cena.',
    '• O asset original será sobreposto exclusivamente em pós-produção a partir do arquivo original cadastrado.',
    `• Mantenha a área (${placementText}) completamente limpa e desobstruída.`,
  ].join('\n') };
}

export type ExactAsset = { id: string; name: string; workspace_id: string; category: string; asset_subtype: string | null; placement: string | null; scale_percent: number | null; storage_path: string; mime_type: string };

/** Agent must be loaded server-side. reference_ids is the persisted, authorized link
 * written by set_asset_agents, which also permits explicit cross-workspace sharing. */
export async function resolveExactAssets(agent: Agent): Promise<ExactAsset[]> {
  const ids = Array.isArray(agent.visual_settings?.reference_ids)
    ? (agent.visual_settings.reference_ids as string[]).filter(id => /^[0-9a-f-]{36}$/i.test(id)) : [];
  if (!ids.length) { console.log('[Exact Asset Selection]', { hasExactLogoAsset: false, agentId: agent.id, linkedAssetCount: 0 }); return []; }
  const { data, error } = await adminClient().from('assets')
    .select('id,name,workspace_id,category,asset_subtype,placement,scale_percent,storage_path,mime_type')
    .eq('category', 'exact_asset').in('id', ids);
  if (error) throw new Error('internal_error');
  const assets = (data || []) as ExactAsset[];
  const logos = assets.filter(a => !a.asset_subtype || a.asset_subtype === 'logo');
  if (logos.length > 1) throw new Error('invalid_input'); // Never choose an arbitrary competing logo.
  for (const asset of assets) console.log('[Exact Asset Selection]', {
    hasExactLogoAsset: logos.length === 1, selectedExactAssetId: asset.id,
    selectedExactAssetName: asset.name, category: asset.category, asset_subtype: asset.asset_subtype,
    selectedExactAssetPlacement: asset.placement, selectedExactAssetScalePercent: asset.scale_percent,
    storage_path: asset.storage_path, assetWorkspaceId: asset.workspace_id,
    agentWorkspaceId: agent.workspace_id, agentId: agent.id, explicitlyLinked: ids.includes(asset.id),
    active: true, // Assets have no active column: inclusion in reference_ids enables the asset.
  });
  return assets;
}

export async function getExactAssetGuidance(agent: Agent): Promise<string> {
  return (await getExactAssetPolicy(agent)).guidance;
}

/**
 * Applies exact assets (e.g. official logo) onto the generated image in post-processing.
 */
export async function applyExactAssets(params: {
  imageBuffer: Buffer | Uint8Array;
  agent: Agent;
  ratio: string;
  channel?: string;
  workspaceId?: string;
  expectedLogo?: boolean;
}): Promise<Buffer> {
  const wsId = params.workspaceId || params.agent.workspace_id;
  const db = adminClient();

  if (wsId !== params.agent.workspace_id) throw new Error('forbidden');
  const exactAssets = await resolveExactAssets(params.agent);
  const expectedLogo = params.expectedLogo || exactAssets.some(a => !a.asset_subtype || a.asset_subtype === 'logo');
  if (!exactAssets || !exactAssets.length) {
    if (expectedLogo) throw new Error('internal_error');
    console.log('[Image Logo Policy]', { exactLogoPostApplied: false });
    return Buffer.isBuffer(params.imageBuffer) ? params.imageBuffer : Buffer.from(params.imageBuffer);
  }

  // If there are multiple exact assets, prioritize logo if configured, or the first active one
  const activeOverlay =
    exactAssets.find(
      (a) => (!a.asset_subtype || a.asset_subtype === 'logo') && a.placement && a.placement !== 'manual' && a.placement !== 'none',
    ) ||
    exactAssets.find(
      (a) => a.placement && a.placement !== 'manual' && a.placement !== 'none',
    );

  if (!activeOverlay) {
    if (expectedLogo) throw new Error('invalid_input');
    console.log('[Image Logo Policy]', { exactLogoPostApplied: false });
    return Buffer.isBuffer(params.imageBuffer) ? params.imageBuffer : Buffer.from(params.imageBuffer);
  }

  try {
    if (expectedLogo && activeOverlay.asset_subtype && activeOverlay.asset_subtype !== 'logo') throw new Error('internal_error');
    if (!['top_left','top_right','bottom_left','bottom_right'].includes(activeOverlay.placement || '') || !Number.isFinite(activeOverlay.scale_percent) || activeOverlay.scale_percent! <= 0 || activeOverlay.scale_percent! > 100) throw new Error('invalid_input');
    const download = await db.storage.from('brand-assets').download(activeOverlay.storage_path);
    if (download.error || !download.data) {
      if (!activeOverlay.asset_subtype || activeOverlay.asset_subtype === 'logo') throw new Error('internal_error');
      console.log('[Image Logo Policy]', { exactLogoPostApplied: false });
      return Buffer.isBuffer(params.imageBuffer) ? params.imageBuffer : Buffer.from(params.imageBuffer);
    }

    const overlayBytes = Buffer.from(await download.data.arrayBuffer());
    console.log('[Exact Asset Composition]', { selectedExactAssetId: activeOverlay.id, exactAssetBufferLoaded: overlayBytes.length > 0, exactAssetCompositionStarted: true });
    const composited = await compositeExactAssetBuffer(
      params.imageBuffer,
      overlayBytes,
      activeOverlay.placement!,
      activeOverlay.scale_percent ?? 20,
    );
    if (!composited.length) throw new Error('internal_error');
    if (composited.equals(Buffer.from(params.imageBuffer))) {
      console.warn('[Exact Asset Composition] Composited bytes identical to source. Persisting original image.', { selectedExactAssetId: activeOverlay.id, placement: activeOverlay.placement, scale_percent: activeOverlay.scale_percent });
      return Buffer.isBuffer(params.imageBuffer) ? params.imageBuffer : Buffer.from(params.imageBuffer);
    }
    return composited;
  } catch (err) {
    console.log('[Image Logo Policy]', { exactLogoPostApplied: false });
    if (!activeOverlay.asset_subtype || activeOverlay.asset_subtype === 'logo') throw new Error('internal_error');
    return Buffer.isBuffer(params.imageBuffer) ? params.imageBuffer : Buffer.from(params.imageBuffer);
  }
}
