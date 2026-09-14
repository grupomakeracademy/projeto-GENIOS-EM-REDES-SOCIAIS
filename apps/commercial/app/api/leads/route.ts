import { leadSchema, whatsappUrl } from '../../../lib/leads';
export const runtime = 'nodejs';
const reply = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function POST(request: Request) {
  try {
    const origin = process.env.COMMERCIAL_ORIGIN || (process.env.NODE_ENV !== 'production' ? new URL(request.url).origin : '');
    if (!origin || request.headers.get('origin') !== new URL(origin).origin) return reply({ error: 'Origem não autorizada.' }, 403);
    if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({ error: 'Formato inválido.' }, 415);
    // Stream limit also covers chunked bodies, not just Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: 'Preencha o formulário.' }, 400);
    let bytes = 0; const chunks: Uint8Array[] = [];
    while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.length; if (bytes > 8192) { await reader.cancel(); return reply({ error: 'Formulário muito grande.' }, 413); } chunks.push(value); }
    let raw: unknown;
    try { raw = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return reply({ error: 'Formulário inválido.' }, 400); }
    const parsed = leadSchema.safeParse(raw);
    if (!parsed.success) return reply({ error: 'Confira os campos e informe um WhatsApp válido com DDD.' }, 400);
    const url = process.env.SUPABASE_URL; const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return reply({ error: 'O atendimento está temporariamente indisponível. Seus dados continuam no formulário.' }, 503);
    const { requestId, website: _website, ...payload } = parsed.data;
    const result = await fetch(`${url}/rest/v1/rpc/submit_commercial_lead`, {
      method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: requestId, payload }), cache: 'no-store', signal: AbortSignal.timeout(12000),
    });
    if (!result.ok) return reply({ error: 'Não foi possível registrar seus dados. Aguarde um momento e tente novamente.' }, 503);
    const saved = await result.json();
    if (saved !== true) return reply({ error: 'Muitas solicitações. Aguarde alguns minutos antes de tentar novamente.' }, 429);
    const number = process.env.COMMERCIAL_WHATSAPP || '5519988788759';
    return reply({ saved: true, whatsappUrl: whatsappUrl(parsed.data, /^55\d{10,11}$/.test(number) ? number : '5519988788759') });
  } catch { return reply({ error: 'Não foi possível confirmar o registro. Seus dados foram mantidos; tente novamente.' }, 503); }
}
