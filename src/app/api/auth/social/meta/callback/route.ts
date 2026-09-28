import { adminClient } from '@/lib/supabase/server';
import { checked } from '@/lib/security/context';
import { encrypt } from '@/lib/security/crypto';

interface DiscoveredPage {
  id: string;
  name: string;
  access_token: string;
  category?: string;
  instagram_business_account?: {
    id: string;
    username?: string;
    name?: string;
    account_type?: string;
    profile_picture_url?: string;
  };
  connected_instagram_account?: {
    id: string;
    username?: string;
    name?: string;
    profile_picture_url?: string;
  };
}

interface DiscoveredInstagram {
  id: string;
  username: string;
  name?: string;
  account_type?: string;
  profile_picture_url?: string;
  page_id?: string;
  page_name?: string;
  access_token?: string;
}

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
    let accountType: string | undefined;

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

      // Trocar code por token de usuário de curta duração
      const tokenRes = await fetch(
        `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${encodeURIComponent(clientSecret)}&code=${encodeURIComponent(code)}`,
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
        `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&fb_exchange_token=${encodeURIComponent(shortLivedToken)}`,
      );

      let userToken = shortLivedToken;
      if (longLivedRes.ok) {
        const longJson = (await longLivedRes.json()) as { access_token: string };
        userToken = longJson.access_token || shortLivedToken;
      }

      // Buscar perfil do usuário e permissões concedidas (para diagnóstico)
      const meRes = await fetch(
        `https://graph.facebook.com/v21.0/me?fields=id,name,email&access_token=${encodeURIComponent(userToken)}`,
      ).catch(() => null);
      const meData = meRes?.ok ? await meRes.json().catch(() => ({})) : {};
      const userName = meData.name || 'seu perfil do Facebook';

      const permsRes = await fetch(
        `https://graph.facebook.com/v21.0/me/permissions?access_token=${encodeURIComponent(userToken)}`,
      ).catch(() => null);
      const permsData = permsRes?.ok ? await permsRes.json().catch(() => ({})) : {};
      const grantedPermissions = Array.isArray(permsData.data)
        ? permsData.data
            .filter((p: { status?: string }) => p.status === 'granted')
            .map((p: { permission?: string }) => p.permission)
        : [];

      // ESTRATÉGIA COMPLETA DE DESCOBERTA DE PÁGINAS E INSTAGRAM
      const pagesMap = new Map<string, DiscoveredPage>();
      const instagramAccounts: DiscoveredInstagram[] = [];

      const registerPage = (page: DiscoveredPage) => {
        const existing = pagesMap.get(page.id);
        if (!existing) {
          pagesMap.set(page.id, page);
        } else {
          pagesMap.set(page.id, {
            ...existing,
            ...page,
            access_token: page.access_token || existing.access_token,
            instagram_business_account: page.instagram_business_account || existing.instagram_business_account,
            connected_instagram_account: page.connected_instagram_account || existing.connected_instagram_account,
          });
        }
      };

      // 1. ESTRATÉGIA PRINCIPAL: GET /me/accounts (Método Oficial da Meta)
      // Retorna TODAS as páginas com seu Page Access Token e contas do Instagram vinculadas
      try {
        const accountsRes = await fetch(
          `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,category,instagram_business_account{id,username,name,profile_picture_url},connected_instagram_account{id,username,name,profile_picture_url}&access_token=${encodeURIComponent(userToken)}`,
        );
        if (accountsRes.ok) {
          const accJson = (await accountsRes.json()) as { data?: any[] };
          if (Array.isArray(accJson.data)) {
            for (const p of accJson.data) {
              registerPage({
                id: p.id,
                name: p.name,
                access_token: p.access_token,
                category: p.category,
                instagram_business_account: p.instagram_business_account,
                connected_instagram_account: p.connected_instagram_account,
              });
            }
          }
        } else {
          console.error('[Meta OAuth] me/accounts HTTP error:', await accountsRes.text());
        }
      } catch (e) {
        console.error('[Meta OAuth] me/accounts fetch exception:', e);
      }

      // 2. ESTRATÉGIA SECUNDÁRIA: Enriquecer páginas consultando cada nó com o Page Access Token
      // (Algumas contas da Meta não retornam instagram_business_account na listagem /me/accounts, mas retornam no nó /{page_id})
      for (const [pageId, page] of Array.from(pagesMap.entries())) {
        const tokenToUse = page.access_token || userToken;
        if (!page.instagram_business_account && !page.connected_instagram_account) {
          try {
            const pageDetailRes = await fetch(
              `https://graph.facebook.com/v21.0/${pageId}?fields=instagram_business_account{id,username,name,profile_picture_url,account_type},connected_instagram_account{id,username,name,profile_picture_url}&access_token=${encodeURIComponent(tokenToUse)}`,
            );
            if (pageDetailRes.ok) {
              const detailJson = (await pageDetailRes.json()) as any;
              if (detailJson.instagram_business_account) {
                page.instagram_business_account = detailJson.instagram_business_account;
              }
              if (detailJson.connected_instagram_account) {
                page.connected_instagram_account = detailJson.connected_instagram_account;
              }
            }
          } catch (e) {
            console.error(`[Meta OAuth] Page detail fetch error for ${pageId}:`, e);
          }
        }

        // Tentar também endpoint /{page_id}/instagram_accounts
        if (!page.instagram_business_account && !page.connected_instagram_account) {
          try {
            const igListRes = await fetch(
              `https://graph.facebook.com/v21.0/${pageId}/instagram_accounts?fields=id,username,name,profile_picture_url&access_token=${encodeURIComponent(tokenToUse)}`,
            );
            if (igListRes.ok) {
              const igListJson = (await igListRes.json()) as any;
              if (Array.isArray(igListJson.data) && igListJson.data.length > 0) {
                page.instagram_business_account = igListJson.data[0];
              }
            }
          } catch (e) {
            console.error(`[Meta OAuth] instagram_accounts fetch error for ${pageId}:`, e);
          }
        }
      }

      // 3. ESTRATÉGIA TERCIÁRIA: Granular Scopes via debug_token (Facebook Login for Business)
      try {
        const debugRes = await fetch(
          `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(userToken)}&access_token=${encodeURIComponent(clientId)}|${encodeURIComponent(clientSecret)}`,
        );
        if (debugRes.ok) {
          const debugData = (await debugRes.json()) as any;
          const granularScopes = debugData?.data?.granular_scopes || [];

          for (const item of granularScopes) {
            // Se o escopo granular tiver IDs diretos do Instagram
            if (['instagram_basic', 'instagram_content_publish', 'instagram_manage_comments'].includes(item.scope)) {
              for (const igId of item.target_ids || []) {
                try {
                  const igRes = await fetch(
                    `https://graph.facebook.com/v21.0/${igId}?fields=id,username,name,profile_picture_url,account_type&access_token=${encodeURIComponent(userToken)}`,
                  );
                  if (igRes.ok) {
                    const igJson = (await igRes.json()) as any;
                    if (igJson.id && !instagramAccounts.some((acc) => acc.id === igJson.id)) {
                      instagramAccounts.push({
                        id: igJson.id,
                        username: igJson.username || `instagram_${igJson.id}`,
                        name: igJson.name,
                        account_type: igJson.account_type || 'BUSINESS',
                        profile_picture_url: igJson.profile_picture_url,
                        access_token: userToken,
                      });
                    }
                  }
                } catch (e) {
                  console.error(`[Meta OAuth] Error fetching granular IG ${igId}:`, e);
                }
              }
            }

            // Se o escopo granular tiver IDs de páginas que ainda não temos
            if (['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'].includes(item.scope)) {
              for (const pid of item.target_ids || []) {
                if (!pagesMap.has(pid)) {
                  try {
                    const pRes = await fetch(
                      `https://graph.facebook.com/v21.0/${pid}?fields=id,name,access_token&access_token=${encodeURIComponent(userToken)}`,
                    );
                    if (pRes.ok) {
                      const pJson = (await pRes.json()) as any;
                      registerPage({
                        id: pJson.id,
                        name: pJson.name,
                        access_token: pJson.access_token || userToken,
                      });
                    }
                  } catch (e) {
                    console.error(`[Meta OAuth] Error fetching granular page ${pid}:`, e);
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        console.error('[Meta OAuth] debug_token fetch error:', e);
      }

      // 4. ESTRATÉGIA QUATERNÁRIA: Meta Business Suite (me/businesses) se nada encontrado
      if (
        pagesMap.size === 0 ||
        (!instagramAccounts.length &&
          !Array.from(pagesMap.values()).some((p) => p.instagram_business_account || p.connected_instagram_account))
      ) {
        try {
          const bizRes = await fetch(
            `https://graph.facebook.com/v21.0/me/businesses?fields=id,name,owned_pages{id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}},client_pages{id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}},instagram_business_accounts{id,username,name,profile_picture_url}&access_token=${encodeURIComponent(userToken)}`,
          );
          if (bizRes.ok) {
            const bizJson = (await bizRes.json()) as any;
            if (Array.isArray(bizJson.data)) {
              for (const biz of bizJson.data) {
                const allPages = [
                  ...(biz.owned_pages?.data || []),
                  ...(biz.client_pages?.data || []),
                ];
                for (const p of allPages) {
                  registerPage({
                    id: p.id,
                    name: p.name,
                    access_token: p.access_token,
                    instagram_business_account: p.instagram_business_account,
                  });
                }
                if (Array.isArray(biz.instagram_business_accounts?.data)) {
                  for (const ig of biz.instagram_business_accounts.data) {
                    if (!instagramAccounts.some((acc) => acc.id === ig.id)) {
                      instagramAccounts.push({
                        id: ig.id,
                        username: ig.username || `instagram_${ig.id}`,
                        name: ig.name,
                        profile_picture_url: ig.profile_picture_url,
                        access_token: userToken,
                      });
                    }
                  }
                }
              }
            }
          }
        } catch (e) {
          console.error('[Meta OAuth] me/businesses fetch error:', e);
        }
      }

      // Coletar todas as contas de Instagram descobertas via páginas
      const allPages = Array.from(pagesMap.values());
      for (const page of allPages) {
        const ig = page.instagram_business_account || page.connected_instagram_account;
        if (ig && ig.id && !instagramAccounts.some((acc) => acc.id === ig.id)) {
          let username = ig.username;
          let profilePic = ig.profile_picture_url;
          if (!username) {
            try {
              const igInfoRes = await fetch(
                `https://graph.facebook.com/v21.0/${ig.id}?fields=id,username,name,profile_picture_url,account_type&access_token=${encodeURIComponent(page.access_token || userToken)}`,
              );
              if (igInfoRes.ok) {
                const igInfo = (await igInfoRes.json()) as any;
                username = igInfo.username;
                profilePic = igInfo.profile_picture_url;
              }
            } catch (e) {
              console.error(`[Meta OAuth] IG info fetch error for ${ig.id}:`, e);
            }
          }

          instagramAccounts.push({
            id: ig.id,
            username: username || `instagram_${ig.id}`,
            name: ig.name,
            account_type: (ig as any).account_type || 'BUSINESS',
            profile_picture_url: profilePic,
            page_id: page.id,
            page_name: page.name,
            access_token: page.access_token || userToken,
          });
        }
      }

      // Validação: caso o perfil não tenha nenhuma página ou conta conectada
      if (allPages.length === 0 && instagramAccounts.length === 0) {
        const grantedList = grantedPermissions.length > 0 ? grantedPermissions.join(', ') : 'nenhuma';
        return renderHtmlResponse({
          success: false,
          message: `Conectado como <strong>${userName}</strong>.<br><br>
          Nenhuma Página do Facebook ou Conta Comercial foi encontrada no seu perfil.<br><br>
          <strong>Permissões concedidas pela Meta:</strong> <code>${grantedList}</code><br><br>
          <strong>Como resolver:</strong><br>
          1. Acesse o <a href="https://www.facebook.com/pages/create" target="_blank" style="color:#38bdf8;">Facebook</a> e confirme que você é Administrador de uma Página comercial.<br>
          2. No painel do Meta Developers, confirme que a permissão <code>pages_show_list</code> está liberada.`,
        });
      }

      // PROCESSAMENTO ESPECÍFICO DO CANAL
      if (channel === 'instagram') {
        const igTarget = instagramAccounts[0];

        if (!igTarget) {
          const pageNamesList = allPages
            .map((p) => `<li><strong>${p.name}</strong> (ID: ${p.id})</li>`)
            .join('');

          return renderHtmlResponse({
            success: false,
            message: `Conectado com sucesso como <strong>${userName}</strong>.<br><br>
            <strong>Páginas encontradas:</strong>
            <ul style="text-align:left;margin:10px 0;padding-left:20px;color:#cbd5e1;">
              ${pageNamesList || '<li>Nenhuma página listada</li>'}
            </ul>
            <strong>Motivo:</strong> Nenhuma das suas Páginas possui uma <strong>Conta Profissional do Instagram (Comercial ou Criador)</strong> vinculada no Meta Business Suite.<br><br>
            <strong>Como vincular em 1 minuto:</strong><br>
            1. Acesse o <a href="https://business.facebook.com/latest/settings/instagram_account" target="_blank" style="color:#38bdf8;text-decoration:underline;">Meta Business Suite &rarr; Contas do Instagram</a>.<br>
            2. Clique em <strong>Adicionar conta</strong> e conecte seu perfil do Instagram.<br>
            3. No app do Instagram no celular, vá em <em>Configurações &rarr; Tipo de conta</em> e confirme que está como <em>Profissional/Criador</em>.<br>
            4. Depois, feche esta janela e clique em Conectar novamente!`,
          });
        }

        accountName = igTarget.username.startsWith('@') ? igTarget.username : `@${igTarget.username}`;
        externalId = igTarget.id;
        accountType = igTarget.account_type || 'BUSINESS';
        const rawToken = igTarget.access_token || userToken;
        try {
          tokenCiphertext = encrypt(rawToken, workspaceId);
        } catch {
          tokenCiphertext = rawToken;
        }
      } else {
        // Canal Facebook
        const page =
          allPages.find((p) => p.name.toLowerCase().includes('maker') || p.name.toLowerCase().includes('geninhos')) ||
          allPages[0];
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
            account_type: accountType,
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
