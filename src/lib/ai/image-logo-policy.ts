import 'server-only';

export type ExactLogoPolicy = {
  hasExactLogoAsset: boolean;
  brandNames: string[];
};

export const NO_LOGO_INSTRUCTION = 'MANDATORY IMAGE RULE — NO BRANDING: Do not draw, write, recreate or infer any logo, brand name, wordmark, visual signature, badge, watermark or brand symbol anywhere, including screens, mugs, clothing, packaging, signs, interfaces and CTA text. Keep reserved overlay areas clean. The official logo is applied ONLY after generation from the original file. Reference images supply character appearance only: never copy their lettering or branding. Ordinary editorial headlines and educational text are allowed, without brand names. This rule overrides conflicting scene or style instructions.';

const brandingClause = /\b(?:logo\w*|logotipo\w*|wordmark\w*|branding|watermark\w*|brand\s+(?:name|symbol|signature)|nome\s+(?:da\s+)?marca|assinatura\s+visual|marca\s+d[’']?água|selo\s+(?:de\s+)?marca|símbolo\s+(?:de\s+)?marca)\b/iu;
const brandingWords = /\b(?:logo\w*|logotipo\w*|wordmark\w*|branding|watermark\w*|brand\s+(?:name|symbol|signature)|nome\s+(?:da\s+)?marca|assinatura\s+visual|marca\s+d[’']?água|selo\s+(?:de\s+)?marca|símbolo\s+(?:de\s+)?marca)\b/giu;
const directiveOnly = /^(?:desenhe|adicione|crie|coloque|insira|gerar?|desenhar?|criar?|adicionar?|o|a|os|as|um|uma|uns|umas|de|da|do|dos|das|no|na|nos|nas|com|sem|para|e|ou|[.,;:!?-]|\s)*$/iu;

function aliasPattern(name: string): RegExp | undefined {
  const tokens = name.normalize('NFD').replace(/\p{M}/gu, '').match(/[\p{L}\p{N}]+/gu);
  if (!tokens?.length) return;
  const accents: Record<string, string> = { a: '[aáàâãä]', e: '[eéèêë]', i: '[iíìîï]', o: '[oóòôõö]', u: '[uúùûü]', c: '[cç]' };
  const source = tokens.map(token => [...token.toLowerCase()].map(c => accents[c] || c).join('')).join('[\\s\\p{P}\\p{S}_]*');
  return new RegExp(`(?<![\\p{L}\\p{N}])${source}(?![\\p{L}\\p{N}])`, 'giu');
}

/** Applies only to visual input; captions and stored briefing remain intact. */
export function suppressVisualBranding(text: string | undefined, names: string[]): string | undefined {
  if (!text) return text;
  let result = text.normalize('NFC').replace(/[\u200B-\u200D\uFEFF]/g, '');
  // Drop conflicting directives, including logo instructions inherited from cached DNA summaries.
  // Split on sentence and clause boundaries (periods, commas, semicolons, exclamation/question marks, newlines)
  const clauses = result.split(/(?<=[.!?;,])\s+|\n/u);
  const filtered = clauses.filter(clause => !brandingClause.test(clause));
  if (filtered.length > 0) {
    result = filtered.join(' ');
  } else {
    // If dropping all clauses would completely erase the text, only strip the branding words/phrases
    result = result.replace(brandingWords, ' ');
  }

  for (const name of [...new Set(names)].filter(Boolean).sort((a, b) => b.length - a.length)) {
    const pattern = aliasPattern(name);
    if (pattern) result = result.replace(pattern, ' ');
  }
  result = result.replace(/\s+/g, ' ').replace(/[,;:\s]+$/, '').trim();
  if (directiveOnly.test(result)) return '';
  return result;
}
