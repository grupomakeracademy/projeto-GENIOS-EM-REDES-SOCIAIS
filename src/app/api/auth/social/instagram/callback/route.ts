function getAppOrigin(request: Request): string {
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0].trim();
  const host = forwardedHost || request.headers.get('host');
  const proto = (request.headers.get('x-forwarded-proto') || 'https').split(',')[0].trim();

  if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
    return `${proto}://${host}`;
  }

  const envOrigin = process.env.APP_ORIGIN;
  if (envOrigin && !envOrigin.includes('localhost') && !envOrigin.includes('127.0.0.1')) {
    return envOrigin.replace(/\/$/, '');
  }

  return 'https://geniosrsocial.grupomakeracademy.com.br';
}

import { adminClient } from '@/lib/supabase/server';
import { checked } from '@/lib/security/context';
import { encrypt } from '@/lib/security/crypto';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rawCode = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const errorParam =
      url.searchParams.get('error_description') ||
      url.searchParams.get('error') ||
      url.searchParams.get('error_reason');

    if (errorParam) {
      return renderHtmlResponse({
        success: false,
        message: `Autorização cancelada ou recusada pelo Instagram: ${errorParam}`,
      });
    }

    if (!rawCode || !state) {
      return renderHtmlResponse({
        success: false,
        message: 'Código de autorização ou estado de segurança ausente.',
      });
    }

    // A documentação do Instagram indica que #_ pode ser anexado ao final do redirect_uri
    const code = rawCode.replace(/#_$/, '').replace(/#.*$/, '');

    let decodedState: { workspaceId: string; agentId: string; channel: string };
    try {
      decodedState = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    } catch {
      return renderHtmlResponse({
        success: false,
        message: 'Falha ao decodificar os dados da sessão (state inválido).',
      });
    }

    const { workspaceId, agentId } = decodedState;
    const db = adminClient();

    const clientId =
      process.env.INSTAGRAM_APP_ID ||
      '1755657845653213';
    const clientSecret =
      process.env.INSTAGRAM_APP_SECRET ||
      '9e1fa4ab1649b7b7485636a039f25106';

    const appOrigin = getAppOrigin(request);
    const redirectUri = `${appOrigin}/api/auth/social/instagram/callback`;

    if (!clientId || !clientSecret) {
      return renderHtmlResponse({
        success: false,
        message: 'Credenciais do Instagram/Meta não configuradas no servidor.',
      });
    }

    // 1. Trocar code por token de curta duração via POST em api.instagram.com/oauth/access_token
    const tokenFormData = new URLSearchParams();
    tokenFormData.append('client_id', clientId);
    tokenFormData.append('client_secret', clientSecret);
    tokenFormData.append('grant_type', 'authorization_code');
    tokenFormData.append('redirect_uri', redirectUri);
    tokenFormData.append('code', code);

    const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenFormData.toString(),
    });

    if (!tokenRes.ok) {
      const errJson = (await tokenRes.json().catch(() => ({}))) as any;
      console.error('[Instagram Direct OAuth] Token error:', errJson);
      return renderHtmlResponse({
        success: false,
        message: `Falha ao obter token do Instagram: ${errJson.error_message || errJson.message || JSON.stringify(errJson)}`,
      });
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      user_id: number | string;
    };
    const shortLivedToken = tokenData.access_token;
    const userId = String(tokenData.user_id);

    // 2. Trocar por token de longa duração (60 dias) via graph.instagram.com/access_token
    let finalToken = shortLivedToken;
    try {
      const longLivedRes = await fetch(
        `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(
          clientSecret,
        )}&access_token=${encodeURIComponent(shortLivedToken)}`,
      );
      if (longLivedRes.ok) {
        const longData = (await longLivedRes.json()) as { access_token?: string };
        if (longData.access_token) {
          finalToken = longData.access_token;
        }
      }
    } catch (e) {
      console.warn('[Instagram Direct OAuth] Long-lived token warning:', e);
    }

        // 3. Obter dados do perfil do Instagram (/me)
    let igUsername = `instagram_${userId}`;
    let accountType = 'BUSINESS';
    let profilePicUrl: string | undefined;
    let exactExternalId = userId;

    try {
      const meRes = await fetch(
        `https://graph.instagram.com/v21.0/me?fields=id,user_id,username,name,account_type,profile_picture_url&access_token=${encodeURIComponent(
          finalToken,
        )}`,
      );
      if (meRes.ok) {
        const meJson = (await meRes.json()) as any;
        if (meJson.id) {
          exactExternalId = String(meJson.id);
        }
        if (meJson.username) {
          igUsername = meJson.username;
        }
        if (meJson.account_type) {
          accountType = meJson.account_type;
        }
        if (meJson.profile_picture_url) {
          profilePicUrl = meJson.profile_picture_url;
        }
      }
    } catch (e) {
      console.error('[Instagram Direct OAuth] /me fetch error:', e);
    }

    const accountName = igUsername.startsWith('@') ? igUsername : `@${igUsername}`;

    // 4. Salvar conexão no banco de dados (tabela social_connections)
    let tokenCiphertext = finalToken;
    try {
      tokenCiphertext = encrypt(finalToken, workspaceId);
    } catch {
      tokenCiphertext = finalToken;
    }

    checked(
      await db.from('social_connections').upsert(
        {
          workspace_id: workspaceId,
          agent_id: agentId,
          channel: 'instagram',
          account_name: accountName,
          external_id: exactExternalId,
          token_ciphertext: tokenCiphertext,
          metadata: {
            id: exactExternalId,
            user_id: userId,
            connected_via: 'instagram_direct_login',
            connected_at: new Date().toISOString(),
            account_type: accountType,
            username: igUsername,
            profile_picture_url: profilePicUrl,
          },
          created_at: new Date().toISOString(),
        },
        { onConflict: 'workspace_id,agent_id,channel' },
      ),
    );

    return renderHtmlResponse({
      success: true,
      channel: 'instagram',
      accountName,
      message: `Conta ${accountName} conectada diretamente com sucesso!`,
    });
  } catch (err) {
    console.error('[Instagram OAuth Callback] Error:', err);
    return renderHtmlResponse({
      success: false,
      message: 'Erro interno ao processar a autenticação direta do Instagram.',
    });
  }
}

function renderHtmlResponse({
  success,
  channel,
  accountName,
  message,
}: {
  success: boolean;
  channel?: string;
  accountName?: string;
  message: string;
}) {
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>${success ? 'Conectado com Sucesso' : 'Erro de Conexão'}</title>
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
      text-align: center;
    }
    .card {
      background: #1e293b;
      border: 1px solid ${success ? '#059669' : '#dc2626'};
      border-radius: 12px;
      padding: 30px;
      max-width: 440px;
      width: 100%;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    }
    h2 {
      margin-top: 0;
      color: ${success ? '#34d399' : '#f87171'};
      font-size: 20px;
    }
    p {
      color: #94a3b8;
      font-size: 14px;
      line-height: 1.6;
    }
    .btn {
      display: inline-block;
      padding: 10px 20px;
      background: #334155;
      color: #cbd5e1;
      border-radius: 6px;
      text-decoration: none;
      font-size: 14px;
      margin-top: 15px;
      cursor: pointer;
      border: none;
    }
    .btn:hover {
      background: #475569;
    }
  </style>
</head>
<body>
  <div class="card">
    <h2>${success ? '✅ Conexão Concluída!' : '❌ Falha na Conexão'}</h2>
    <p>${message}</p>
    ${
      success
        ? '<p style="font-size:12px;color:#64748b;">Fechando janela automaticamente...</p>'
        : '<button class="btn" onclick="window.close()">Fechar Janela</button>'
    }
  </div>

  <script>
    ${
      success
        ? `
      try {
        if (window.opener) {
          window.opener.postMessage({
            type: 'social_connected',
            channel: ${JSON.stringify(channel)},
            accountName: ${JSON.stringify(accountName)}
          }, '*');
          setTimeout(() => window.close(), 1200);
        } else {
          setTimeout(() => { window.location.href = '/channels'; }, 1500);
        }
      } catch (e) {
        console.error(e);
      }
    `
        : ''
    }
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
