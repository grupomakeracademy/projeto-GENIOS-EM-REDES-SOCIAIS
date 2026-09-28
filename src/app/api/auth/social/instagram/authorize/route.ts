import { context } from '@/lib/security/context';
import { adminClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const agentId = url.searchParams.get('agent');

    if (!agentId) {
      return new Response('Parâmetro agent obrigatório', { status: 400 });
    }

    let workspaceId: string | undefined;

    // Tentar obter da sessão ativa
    try {
      const ctx = await context('read');
      workspaceId = ctx.workspaceId;
    } catch {
      // Caso cookies de sessão estejam restritos na janela popup, busca via agentId
      const { data: agent } = await adminClient()
        .from('agents')
        .select('workspace_id')
        .eq('id', agentId)
        .maybeSingle();

      workspaceId = agent?.workspace_id;
    }

    if (!workspaceId) {
      return new Response('Agente ou workspace não encontrado.', { status: 404 });
    }

    const statePayload = {
      workspaceId,
      agentId,
      channel: 'instagram',
      nonce: crypto.randomUUID(),
    };
    const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url');

    // Instagram App ID: pode ser INSTAGRAM_APP_ID ou META_CLIENT_ID
    const clientId =
      process.env.INSTAGRAM_APP_ID ||
      process.env.META_CLIENT_ID ||
      process.env.META_APP_ID;

    let appOrigin = process.env.APP_ORIGIN;
    if (!appOrigin || appOrigin.includes('127.0.0.1')) {
      const reqUrl = new URL(request.url);
      appOrigin = reqUrl.origin;
    }
    if (appOrigin.includes('127.0.0.1')) {
      appOrigin = appOrigin.replace('127.0.0.1', 'localhost');
    }
    const redirectUri = `${appOrigin}/api/auth/social/instagram/callback`;

    if (clientId) {
      // Escopos oficiais da Instagram API with Instagram Login (sem necessidade de Facebook Page)
      const scopes = [
        'instagram_business_basic',
        'instagram_business_content_publish',
        'instagram_business_manage_messages',
        'instagram_business_manage_comments',
      ].join(',');

      // Endpoint oficial da API do Instagram (login direto no Instagram)
      const instagramAuthUrl = `https://api.instagram.com/oauth/authorize?client_id=${encodeURIComponent(
        clientId,
      )}&redirect_uri=${encodeURIComponent(
        redirectUri,
      )}&scope=${encodeURIComponent(scopes)}&response_type=code&state=${encodeURIComponent(
        state,
      )}`;

      return Response.redirect(instagramAuthUrl);
    }

    return new Response('INSTAGRAM_APP_ID ou META_CLIENT_ID não configurado no servidor.', {
      status: 500,
    });
  } catch (err) {
    console.error('[Instagram OAuth Authorize] Error:', err);
    return new Response(
      `Erro ao iniciar autorização: ${err instanceof Error ? err.message : String(err)}`,
      { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }
}
