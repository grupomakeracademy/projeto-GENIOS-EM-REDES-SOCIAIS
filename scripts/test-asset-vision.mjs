import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const pgClient = new pg.Client({ connectionString: process.env.DATABASE_URL });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const OPENAI_KEY = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;

function computeContentHash(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function buildVisualSummaryText(interp) {
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

async function processSingleAsset(asset) {
  console.log(`\n--- Processando Asset: ${asset.name} (${asset.id}) ---`);
  
  // 1. Download from storage
  const dl = await supabase.storage.from('brand-assets').download(asset.storage_path);
  if (dl.error || !dl.data) {
    throw new Error(`Download failed: ${dl.error?.message}`);
  }
  const buf = Buffer.from(await dl.data.arrayBuffer());
  const hash = computeContentHash(buf);
  console.log(`Bytes: ${buf.length}, SHA-256: ${hash}`);

  // 2. Check deduplication
  const dedupRes = await pgClient.query(
    `SELECT textual_interpretation, summary_text, processor_model, processing_version 
     FROM public.assets 
     WHERE content_hash = $1 AND processing_status = 'processed' AND summary_text IS NOT NULL AND id != $2 
     LIMIT 1;`,
    [hash, asset.id]
  );

  if (dedupRes.rows.length > 0) {
    const existing = dedupRes.rows[0];
    console.log(`[DEDUPLICADO] Encontrado hash idêntico já processado! Reutilizando interpretação (0 chamadas à API).`);
    await pgClient.query(
      `UPDATE public.assets 
       SET content_hash = $1, processing_status = 'processed', processing_error = NULL, 
           processed_at = NOW(), processor_model = $2, processing_version = $3, 
           textual_interpretation = $4, summary_text = $5 
       WHERE id = $6;`,
      [hash, existing.processor_model, existing.processing_version || 1, existing.textual_interpretation, existing.summary_text, asset.id]
    );
    return { status: 'deduplicated', summary: existing.summary_text };
  }

  // 3. Call Vision API once
  const base64 = buf.toString('base64');
  const model = process.env.OPENAI_VISION_MODEL || 'gpt-4o';
  console.log(`Chamando modelo de visão ${model} (1 única chamada)...`);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'Você é o especialista sênior em direção de arte e identidade visual do sistema Gênios para Redes Sociais. Sua função é analisar detalhadamente imagens de referência da Biblioteca de Marca (logos, mascotes, fotos de produtos, ilustrações, guias de estilo) e extrair todo o seu DNA visual em formato estruturado. O texto que você produzir será utilizado diretamente por geradores de imagem para reproduzir com máxima fidelidade o estilo, personagens, cores e identidade da marca SEM precisar reenviar a imagem original. Retorne exclusivamente o JSON estruturado requerido.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analise a referência visual "${asset.name}" e extraia o DNA visual completo.`,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${asset.mime_type};base64,${base64}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'visual_reference_interpretation',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              reference_type: {
                type: 'string',
                enum: ['logo', 'mascot', 'character', 'style_guide', 'color_palette', 'product', 'scenery', 'typography', 'general_reference'],
              },
              title: { type: 'string' },
              visual_description: { type: 'string' },
              composition_and_framing: { type: 'string' },
              art_style: { type: 'string' },
              brand_identity_and_mood: { type: 'string' },
              predominant_colors: { type: 'array', items: { type: 'string' } },
              typography_style: { type: 'string' },
              characters_and_mascots: { type: 'string' },
              logos_and_symbols: { type: 'string' },
              mandatory_elements: { type: 'array', items: { type: 'string' } },
              elements_to_avoid: { type: 'array', items: { type: 'string' } },
              generation_guidelines: { type: 'string' },
            },
            required: [
              'reference_type', 'title', 'visual_description', 'composition_and_framing',
              'art_style', 'brand_identity_and_mood', 'predominant_colors', 'typography_style',
              'characters_and_mascots', 'logos_and_symbols', 'mandatory_elements', 'elements_to_avoid',
              'generation_guidelines'
            ],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI Vision Error ${response.status}: ${errText}`);
  }

  const json = await response.json();
  const content = json.choices[0]?.message?.content;
  const parsed = JSON.parse(content);
  const summary = buildVisualSummaryText(parsed);

  console.log('Interpretação extraída com sucesso:');
  console.log(JSON.stringify(parsed, null, 2));
  console.log('\nResumo gerado para o prompt:');
  console.log(summary);

  // 4. Save to DB
  await pgClient.query(
    `UPDATE public.assets 
     SET content_hash = $1, processing_status = 'processed', processing_error = NULL, 
         processed_at = NOW(), processor_model = $2, processing_version = 1, 
         textual_interpretation = $3, summary_text = $4 
     WHERE id = $5;`,
    [hash, model, JSON.stringify(parsed), summary, asset.id]
  );

  console.log(`[OK] Asset "${asset.name}" salvo no banco com status 'processed'.`);
  return { status: 'processed', summary };
}

async function main() {
  try {
    await pgClient.connect();
    
    // Process the logo asset first as test: 3f01bb34-285d-4331-8b67-98811eee9269
    const logoRes = await pgClient.query(
      "SELECT id, name, mime_type, storage_path FROM public.assets WHERE id = '3f01bb34-285d-4331-8b67-98811eee9269';"
    );
    if (!logoRes.rows.length) {
      console.log('Logo asset not found');
      return;
    }

    await processSingleAsset(logoRes.rows[0]);

  } catch (err) {
    console.error('Erro na execução:', err);
  } finally {
    await pgClient.end();
  }
}

main();
