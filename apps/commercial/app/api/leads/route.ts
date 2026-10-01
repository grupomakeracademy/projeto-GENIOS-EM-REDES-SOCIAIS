import { leadSchema, whatsappUrl } from '../../../lib/leads';

export const runtime = 'nodejs';

const reply = (body: object, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

function isOriginAllowed(request: Request): boolean {
  const originHeader = request.headers.get('origin');
  const hostHeader = request.headers.get('x-forwarded-host') || request.headers.get('host');

  const allowedHosts = new Set([
    'localhost',
    '127.0.0.1',
    'geniosrsocial.grupomakeracademy.com.br',
  ]);

  if (hostHeader) {
    allowedHosts.add(hostHeader.toLowerCase().split(':')[0]);
  }

  try {
    const reqUrl = new URL(request.url);
    allowedHosts.add(reqUrl.hostname.toLowerCase());
  } catch {}

  const envOrigins = [process.env.COMMERCIAL_ORIGIN, process.env.APP_ORIGIN];
  for (const eo of envOrigins) {
    if (eo) {
      try {
        const u = eo.startsWith('http') ? new URL(eo) : new URL(`https://${eo}`);
        allowedHosts.add(u.hostname.toLowerCase());
      } catch {}
    }
  }

  if (!originHeader) {
    const referer = request.headers.get('referer');
    if (referer) {
      try {
        const refUrl = new URL(referer);
        const refHost = refUrl.hostname.toLowerCase();
        if (allowedHosts.has(refHost) || refHost.endsWith('.vercel.app')) {
          return true;
        }
      } catch {}
    }
    return true;
  }

  try {
    const u = new URL(originHeader);
    const originHost = u.hostname.toLowerCase();
    if (allowedHosts.has(originHost) || originHost.endsWith('.vercel.app')) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export async function POST(request: Request) {
  try {
    if (!isOriginAllowed(request)) {
      return reply({ error: 'Origem não autorizada.' }, 403);
    }

    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return reply({ error: 'Formato inválido.' }, 415);
    }

    const text = await request.text();
    if (!text || text.trim().length === 0) {
      return reply({ error: 'Preencha o formulário.' }, 400);
    }
    if (text.length > 8192) {
      return reply({ error: 'Formulário muito grande.' }, 413);
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return reply({ error: 'Formulário inválido.' }, 400);
    }

    const parsed = leadSchema.safeParse(raw);
    if (!parsed.success) {
      return reply({ error: 'Confira os campos e informe um WhatsApp válido com DDD.' }, 400);
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY;

    if (!url || !key) {
      console.error('[API leads] Supabase URL or Key is missing.');
      return reply(
        {
          error:
            'O atendimento está temporariamente indisponível. Seus dados continuam no formulário.',
        },
        503,
      );
    }

    const {
      requestId,
      company,
      email,
      whatsapp,
      sector,
      employees,
      marketing,
      team,
      difficulty,
      consent,
    } = parsed.data;

    const payload = {
      company,
      email,
      whatsapp,
      sector,
      employees,
      marketing,
      team,
      difficulty,
      consent,
    };

    const result = await fetch(`${url}/rest/v1/rpc/submit_commercial_lead`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ request_id: requestId, payload }),
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });

    if (!result.ok) {
      const errorText = await result.text().catch(() => '');
      console.error('[API leads] Supabase RPC error:', result.status, errorText);
      return reply(
        { error: 'Não foi possível registrar seus dados. Aguarde um momento e tente novamente.' },
        503,
      );
    }

    const saved = await result.json();
    if (saved !== true) {
      return reply(
        { error: 'Muitas solicitações. Aguarde alguns minutos antes de tentar novamente.' },
        429,
      );
    }

    const number = process.env.COMMERCIAL_WHATSAPP || '5519988788759';
    return reply({
      saved: true,
      whatsappUrl: whatsappUrl(
        parsed.data,
        /^55\d{10,11}$/.test(number) ? number : '5519988788759',
      ),
    });
  } catch (err) {
    console.error('[API leads] Unhandled exception in /api/leads:', err);
    return reply(
      {
        error: 'Não foi possível confirmar o registro. Seus dados foram mantidos; tente novamente.',
      },
      503,
    );
  }
}
