import { adminClient } from '@/lib/supabase/server';
import { checked } from '@/lib/security/context';
import { encrypt } from '@/lib/security/crypto';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const simulated = url.searchParams.get('simulated');
    const errorParam = url.searchParams.get('error_description') || url.searchParams.get('error');

    if (errorParam) {
      return renderHtmlResponse({
        success: false,
        message: `Autorização cancelada ou recusada pela Meta: ${errorParam}`,
      });
    }

    if (!state) {
      return renderHtmlResponse({
        success: false,
        message: 'Parâmetro de segurança state ausente ou inválido.',
      });
    }

    let decodedState: { workspaceId: string; agentId: string; channel: string };
    try {
      decodedState = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    } catch {
      return renderHtmlResponse({
        success: false,
        message: 'Falha ao decodificar os dados da sessão (state inválido).',
      });
    }

    const { workspaceId, agentId, channel } = decodedState;
    const db = adminClient();

    let accountName = `@empresa_${channel}`;
    let externalId = `178414000${Math.floor(Math.random() * 1000000)}`;
    let tokenCiphertext = 'demo_connected';

    // 1. Fluxo de Simulação / Demonstração
    if (simulated === '1' || code === 'simulated' || !code) {
      accountName = channel === 'instagram' ? '@minha_marca_oficial' : 'Minha Página Comercial';
      tokenCiphertext = 'demo_connected';
    } else {
      // 2. Fluxo Oficial Meta Graph API
      const clientId = process.env.META_CLIENT_ID || process.env.META_APP_ID;
      const clientSecret = process.env.META_CLIENT_SECRET || process.env.META_APP_SECRET;
      let appOrigin = process.env.APP_ORIGIN;
      if (!appOrigin || appOrigin.includes('127.0.0.1')) {
        const reqUrl = new URL(request.url);
        appOrigin = reqUrl.origin;
      }
      if (appOrigin.includes('127.0.0.1')) {
        appOrigin = appOrigin.replace('127.0.0.1', 'localhost');
      }
      const redirectUri = `${appOrigin}/api/auth/social/meta/callback`;

      if (!clientId || !clientSecret) {
        return renderHtmlResponse({
          success: false,
          message: 'META_CLIENT_ID ou META_CLIENT_SECRET não configurados no servidor.',
        });
      }

      // Trocar code por token de usuário
      const tokenRes = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${encodeURIComponent(clientSecret)}&code=${encodeURIComponent(code)}`,
      );

      if (!tokenRes.ok) {
        const errJson = await tokenRes.json().catch(() => ({}));
        return renderHtmlResponse({
          success: false,
          message: `Falha ao obter token da Meta: ${JSON.stringify(errJson)}`,
        });
      }

      const { access_token: shortLivedToken } = (await tokenRes.json()) as { access_token: string };

      // Trocar por token de longa duração (60 dias)
      const longLivedRes = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&fb_exchange_token=${encodeURIComponent(shortLivedToken)}`,
      );

      let userToken = shortLivedToken;
      if (longLivedRes.ok) {
        const longJson = (await longLivedRes.json()) as { access_token: string };
        userToken = longJson.access_token || shortLivedToken;
      }

      // Buscar Páginas e Contas do Instagram vinculadas
      type PageItem = {
        id: string;
        name: string;
        access_token: string;
        instagram_business_account?: { id: string; username: string; name: string };
      };
      const rawPages: Array<{ id: string; name: string; access_token: string }> = [];
      const pages: PageItem[] = [];
      let accErrorDetail = '';

      // 0. Inspecionar debug_token para Granular Scopes (Facebook Login for Business)
      try {
        const debugRes = await fetch(
          `https://graph.facebook.com/v19.0/debug_token?input_token=${encodeURIComponent(userToken)}&access_token=${encodeURIComponent(clientId)}|${encodeURIComponent(clientSecret)}`,
        );
        if (debugRes.ok) {
          const debugData = (await debugRes.json()) as {
            data?: {
              granular_scopes?: Array<{ scope: string; target_ids?: string[] }>;
            };
          };
          const granularScopes = debugData?.data?.granular_scopes || [];
          const pageIdSet = new Set<string>();
          const igIdSet = new Set<string>();

          for (const item of granularScopes) {
            if (['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'].includes(item.scope)) {
              (item.target_ids || []).forEach((id: string) => pageIdSet.add(id));
            }
            if (['instagram_basic', 'instagram_content_publish'].includes(item.scope)) {
              (item.target_ids || []).forEach((id: string) => igIdSet.add(id));
            }
          }

          for (const pid of pageIdSet) {
            try {
              const pRes = await fetch(
                `https://graph.facebook.com/v19.0/${pid}?fields=id,name,access_token&access_token=${encodeURIComponent(userToken)}`,
              );
              if (pRes.ok) {
                const pJson = (await pRes.json()) as { id: string; name: string; access_token?: string };
                if (!rawPages.some((p) => p.id === pJson.id)) {
                  rawPages.push({
                    id: pJson.id,
                    name: pJson.name,
                    access_token: pJson.access_token || userToken,
                  });
                }
              }
            } catch (e) {
              console.error(`[Meta OAuth] Error fetching granular page ${pid}:`, e);
            }
          }

          for (const igId of igIdSet) {
            try {
              const igRes = await fetch(
                `https://graph.facebook.com/v19.0/${igId}?fields=id,username,name&access_token=${encodeURIComponent(userToken)}`,
              );
              if (igRes.ok) {
                const igJson = (await igRes.json()) as { id: string; username: string; name: string };
                const matchedPage =
                  rawPages.find((p) => p.name.toLowerCase().includes(igJson.name?.toLowerCase())) ||
                  rawPages[0];
                pages.push({
                  id: matchedPage?.id || igJson.id,
                  name: matchedPage?.name || igJson.name,
                  access_token: matchedPage?.access_token || userToken,
                  instagram_business_account: {
                    id: igJson.id,
                    username: igJson.username,
                    name: igJson.name,
                  },
                });
              }
            } catch (e) {
              console.error(`[Meta OAuth] Error fetching granular IG ${igId}:`, e);
            }
          }
        }
      } catch (e) {
        console.error('[Meta OAuth] debug_token fetch error:', e);
      }

      // 1. Tentar me/accounts com campos básicos (id, name, access_token) se rawPages ainda vazio
      if (rawPages.length === 0) {
        try {
          const accountsRes = await fetch(
            `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(userToken)}`,
          );
          if (accountsRes.ok) {
            const accJson = (await accountsRes.json()) as { data?: Array<{ id: string; name: string; access_token: string }> };
            if (Array.isArray(accJson.data)) {
              rawPages.push(...accJson.data);
            }
          } else {
            const errData = await accountsRes.text();
            accErrorDetail = `me/accounts: ${errData}`;
            console.error('[Meta OAuth] me/accounts error:', errData);
          }
        } catch (e) {
          accErrorDetail = `me/accounts exception: ${String(e)}`;
          console.error('[Meta OAuth] me/accounts fetch exception:', e);
        }
      }

      // 2. Se vazio, tentar com shortLivedToken
      if (rawPages.length === 0 && shortLivedToken !== userToken) {
        try {
          const accountsResShort = await fetch(
            `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(shortLivedToken)}`,
          );
          if (accountsResShort.ok) {
            const accJson = (await accountsResShort.json()) as { data?: Array<{ id: string; name: string; access_token: string }> };
            if (Array.isArray(accJson.data)) {
              rawPages.push(...accJson.data);
            }
          }
        } catch (e) {
          console.error('[Meta OAuth] short-lived me/accounts fetch error:', e);
        }
      }

      // 3. Se ainda vazio, tentar buscar via Meta Business Suite (me/businesses)
      if (rawPages.length === 0) {
        try {
          const bizRes = await fetch(
            `https://graph.facebook.com/v19.0/me/businesses?fields=id,name,owned_pages{id,name,access_token},client_pages{id,name,access_token}&access_token=${encodeURIComponent(userToken)}`,
          );
          if (bizRes.ok) {
            const bizJson = (await bizRes.json()) as {
              data?: Array<{
                id: string;
                name: string;
                owned_pages?: { data?: Array<{ id: string; name: string; access_token: string }> };
                client_pages?: { data?: Array<{ id: string; name: string; access_token: string }> };
              }>;
            };
            if (Array.isArray(bizJson.data)) {
              for (const biz of bizJson.data) {
                if (Array.isArray(biz.owned_pages?.data)) {
                  rawPages.push(...biz.owned_pages.data);
                }
                if (Array.isArray(biz.client_pages?.data)) {
                  rawPages.push(...biz.client_pages.data);
                }
              }
            }
          }
        } catch (e) {
          console.error('[Meta OAuth] me/businesses fetch error:', e);
        }
      }

      // 4. Se ainda vazio, tentar me?fields=accounts{...}
      if (rawPages.length === 0) {
        try {
          const meAccRes = await fetch(
            `https://graph.facebook.com/v19.0/me?fields=accounts{id,name,access_token}&access_token=${encodeURIComponent(userToken)}`,
          );
          if (meAccRes.ok) {
            const meAccJson = (await meAccRes.json()) as { accounts?: { data?: Array<{ id: string; name: string; access_token: string }> } };
            if (Array.isArray(meAccJson.accounts?.data)) {
              rawPages.push(...meAccJson.accounts.data);
            }
          }
        } catch (e) {
          console.error('[Meta OAuth] me?fields=accounts fetch error:', e);
        }
      }

      // 5. Enriquecer cada página com o Instagram Business Account vinculado se ainda não estiver em pages
      for (const p of rawPages) {
        if (!pages.some((page) => page.id === p.id)) {
          let igAccount: { id: string; username: string; name: string } | undefined;
        try {
          const igRes = await fetch(
            `https://graph.facebook.com/v19.0/${p.id}?fields=instagram_business_account{id,username,name}&access_token=${encodeURIComponent(p.access_token || userToken)}`,
          );
          if (igRes.ok) {
            const igJson = (await igRes.json()) as {
              instagram_business_account?: { id: string; username: string; name: string };
            };
            igAccount = igJson.instagram_business_account;
          }
        } catch (e) {
          console.error(`[Meta OAuth] Error fetching IG for page ${p.id}:`, e);
        }
          pages.push({
            id: p.id,
            name: p.name,
            access_token: p.access_token,
            instagram_business_account: igAccount,
          });
        }
      }

      if (pages.length === 0) {
        const meRes = await fetch(
          `https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${encodeURIComponent(userToken)}`,
        ).catch(() => null);
        const meData = meRes?.ok ? await meRes.json().catch(() => ({})) : {};
        const userName = meData.name || 'seu perfil pessoal';

        const permsRes = await fetch(
          `https://graph.facebook.com/v19.0/me/permissions?access_token=${encodeURIComponent(userToken)}`,
        ).catch(() => null);
        const permsData = permsRes?.ok ? await permsRes.json().catch(() => ({})) : {};
        const grantedList = Array.isArray(permsData.data)
          ? permsData.data
              .filter((p: { status?: string }) => p.status === 'granted')
              .map((p: { permission?: string }) => p.permission)
              .join(', ')
          : 'nenhuma';

        return renderHtmlResponse({
          success: false,
          message: `Conectado como <strong>${userName}</strong>.<br><br>
          <strong>Permissões concedidas pela Meta:</strong> <code>${grantedList}</code><br>
          ${accErrorDetail ? `<small style="color:#ef4444;display:block;margin-top:6px;">Detalhe: ${accErrorDetail}</small>` : ''}
          <br>
          <strong>Solução no Painel da Meta:</strong><br>
          No Meta Developers (developers.facebook.com), vá em <strong>Casos de uso</strong> ou <strong>Revisão do aplicativo > Permissões e recursos</strong> e adicione as permissões <code>pages_show_list</code> e <code>pages_manage_posts</code> com <em>Acesso Padrão</em> ao seu aplicativo.`,
        });
      }

      if (channel === 'instagram') {
        const pageWithIg = pages.find((p) => p.instagram_business_account?.id);
        if (!pageWithIg || !pageWithIg.instagram_business_account) {
          return renderHtmlResponse({
            success: false,
            message:
              'Nenhuma Conta Profissional do Instagram vinculada à sua Página foi encontrada. Certifique-se de vincular sua conta comercial no Meta Business Suite.',
          });
        }
        accountName = `@${pageWithIg.instagram_business_account.username}`;
        externalId = pageWithIg.instagram_business_account.id;
        const rawToken = pageWithIg.access_token || userToken;
        try {
          tokenCiphertext = encrypt(rawToken, workspaceId);
        } catch {
          tokenCiphertext = rawToken;
        }
      } else {
        const page =
          rawPages.find((p) => p.name.toLowerCase().includes('maker') || p.name.toLowerCase().includes('geninhos')) ||
          pages[0] ||
          rawPages[0];
        accountName = page.name;
        externalId = page.id;
        const rawToken = page.access_token || userToken;
        try {
          tokenCiphertext = encrypt(rawToken, workspaceId);
        } catch {
          tokenCiphertext = rawToken;
        }
      }
    }

    // 3. Salvar / Atualizar conexão no Supabase
    checked(
      await db.from('social_connections').upsert(
        {
          workspace_id: workspaceId,
          agent_id: agentId,
          channel,
          account_name: accountName,
          external_id: externalId,
          token_ciphertext: tokenCiphertext,
          metadata: {
            connected_via: simulated === '1' ? 'demo_oauth' : 'meta_oauth_official',
            connected_at: new Date().toISOString(),
          },
          created_at: new Date().toISOString(),
        },
        { onConflict: 'workspace_id,agent_id,channel' },
      ),
    );

    return renderHtmlResponse({
      success: true,
      channel,
      accountName,
      message: `Conta ${accountName} conectada com sucesso!`,
    });
  } catch (err) {
    console.error('[Meta OAuth Callback] Error:', err);
    return renderHtmlResponse({
      success: false,
      message: 'Erro interno ao processar a autenticação.',
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
