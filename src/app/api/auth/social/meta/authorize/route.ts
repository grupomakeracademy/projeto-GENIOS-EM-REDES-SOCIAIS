import { context } from '@/lib/security/context';
import { adminClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const agentId = url.searchParams.get('agent');
    const channel = url.searchParams.get('channel') || 'facebook';

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
      channel,
      nonce: crypto.randomUUID(),
    };
    const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url');

    const clientId = process.env.META_CLIENT_ID || process.env.META_APP_ID;
    let appOrigin = process.env.APP_ORIGIN;
    if (!appOrigin || appOrigin.includes('127.0.0.1')) {
      const reqUrl = new URL(request.url);
      appOrigin = reqUrl.origin;
    }
    if (appOrigin.includes('127.0.0.1')) {
      appOrigin = appOrigin.replace('127.0.0.1', 'localhost');
    }
    const redirectUri = `${appOrigin}/api/auth/social/meta/callback`;

    // Se as credenciais oficiais da Meta estiverem configuradas, redireciona para a tela de login da Meta
    if (clientId) {
      const scopes = [
        'public_profile',
        'email',
        'instagram_basic',
        'instagram_content_publish',
        'pages_show_list',
        'pages_read_engagement',
        'pages_manage_posts',
        'pages_read_user_content',
        'business_management',
      ].join(',');

      const reauth = url.searchParams.get('reauth') === '1';
      const authType = reauth ? 'reauthenticate,rerequest' : 'rerequest';

      const configId = process.env.META_CONFIG_ID;
      const permParam = configId ? `&config_id=${encodeURIComponent(configId)}` : `&scope=${encodeURIComponent(scopes)}`;
      const metaUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}${permParam}&state=${encodeURIComponent(state)}&response_type=code&auth_type=${authType}`;

      return Response.redirect(metaUrl);
    }

    // Caso META_CLIENT_ID não esteja no .env.local, exibe tela de orientação com suporte a 1 clique simulado
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Conectar Meta / Instagram</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 30px;
      max-width: 480px;
      width: 100%;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    }
    h2 {
      margin-top: 0;
      color: #38bdf8;
      font-size: 20px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    p {
      color: #94a3b8;
      font-size: 14px;
      line-height: 1.6;
    }
    .badge {
      display: inline-block;
      background: #0369a1;
      color: #e0f2fe;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 12px;
      margin-bottom: 15px;
    }
    .btn {
      display: inline-block;
      width: 100%;
      padding: 12px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      text-align: center;
      cursor: pointer;
      text-decoration: none;
      box-sizing: border-box;
      margin-top: 10px;
      border: none;
    }
    .btn-primary {
      background: linear-gradient(135deg, #e1306c, #f77737, #833ab4);
      color: white;
    }
    .btn-secondary {
      background: #334155;
      color: #cbd5e1;
    }
    .btn:hover {
      opacity: 0.95;
    }
    code {
      background: #0f172a;
      padding: 2px 6px;
      border-radius: 4px;
      color: #38bdf8;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">OAuth 2.0 Meta / ${channel === 'facebook' ? 'Facebook' : 'Instagram'}</span>
    <h2>Autenticação Rápida (1 Clique)</h2>
    <p>
      Para autenticação oficial de produção com sua conta real, configure as chaves no seu arquivo <code>.env.local</code>:
      <br><br>
      <code>META_CLIENT_ID=seu_app_id</code><br>
      <code>META_CLIENT_SECRET=seu_app_secret</code>
    </p>
    <p>
      Para testar agora mesmo sem configurar chaves da Meta, use a conexão automática simulada com 1 clique:
    </p>
    <form method="GET" action="${redirectUri}">
      <input type="hidden" name="state" value="${state}">
      <input type="hidden" name="simulated" value="1">
      <button type="submit" class="btn btn-primary">
        Conectar Imediatamente com 1 Clique (Demonstração)
      </button>
    </form>
    <button type="button" class="btn btn-secondary" onclick="window.close()">
      Cancelar
    </button>
  </div>
</body>
</html>`;

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (err) {
    console.error('[Meta OAuth Authorize] Error:', err);
    return new Response(
      `Erro ao iniciar autorização: ${err instanceof Error ? err.message : String(err)}`,
      { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }
}
