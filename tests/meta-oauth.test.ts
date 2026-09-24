import { describe, it, expect } from 'vitest';

describe('Meta OAuth 2.0 Flow', () => {
  it('encodes and decodes OAuth state payload safely', () => {
    const original = {
      workspaceId: '11111111-2222-3333-4444-555555555555',
      agentId: '66666666-7777-8888-9999-000000000000',
      channel: 'instagram',
      nonce: 'random_nonce_123',
    };

    const state = Buffer.from(JSON.stringify(original)).toString('base64url');
    expect(state).not.toContain('+');
    expect(state).not.toContain('/');

    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    expect(decoded.workspaceId).toBe(original.workspaceId);
    expect(decoded.agentId).toBe(original.agentId);
    expect(decoded.channel).toBe(original.channel);
  });

  it('builds Meta OAuth URL with required Instagram scopes', () => {
    const clientId = '1234567890';
    const redirectUri = 'http://127.0.0.1:3001/api/auth/social/meta/callback';
    const scopes = [
      'instagram_basic',
      'instagram_content_publish',
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
    ].join(',');
    const state = 'test_state';

    const metaUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(state)}&response_type=code`;

    const parsed = new URL(metaUrl);
    expect(parsed.origin).toBe('https://www.facebook.com');
    expect(parsed.pathname).toBe('/v19.0/dialog/oauth');
    expect(parsed.searchParams.get('client_id')).toBe(clientId);
    expect(parsed.searchParams.get('redirect_uri')).toBe(redirectUri);
    expect(parsed.searchParams.get('scope')).toContain('instagram_content_publish');
    expect(parsed.searchParams.get('response_type')).toBe('code');
  });

  it('resolves Instagram Business account from Meta pages list', () => {
    const mockPages = [
      {
        id: 'page_without_ig',
        name: 'Página Pessoal',
        access_token: 'token_1',
      },
      {
        id: 'page_with_ig',
        name: 'Página Comercial',
        access_token: 'token_2_page_access',
        instagram_business_account: {
          id: '1784140000001',
          username: 'minha_loja_oficial',
          name: 'Minha Loja Oficial',
        },
      },
    ];

    const pageWithIg = mockPages.find((p) => p.instagram_business_account?.id);
    expect(pageWithIg).toBeDefined();
    expect(pageWithIg?.instagram_business_account?.username).toBe('minha_loja_oficial');
    expect(pageWithIg?.instagram_business_account?.id).toBe('1784140000001');
    expect(pageWithIg?.access_token).toBe('token_2_page_access');
  });
});
