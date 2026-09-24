'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Check, Link2, ExternalLink, Unlink, Plus, ShieldCheck } from 'lucide-react';
import { channels, type Channel } from '@/lib/domain';
import {
  Button,
  Card,
  Modal,
  Field,
  Notice,
  useT,
  useLocale,
  useAction,
  api,
} from '@/components/ui';

const oauthInfo: Record<string, { platform: string; docsUrl: string; desc: string }> = {
  instagram: {
    platform: 'Meta Business Suite',
    docsUrl: 'https://developers.facebook.com/docs/instagram-api',
    desc: 'Requer uma conta profissional do Instagram vinculada a uma Página do Facebook no Meta Business.',
  },
  facebook: {
    platform: 'Meta Business Suite',
    docsUrl: 'https://developers.facebook.com/docs/pages',
    desc: 'Requer permissões de gerenciamento de Página no Facebook Graph API.',
  },
  whatsapp: {
    platform: 'WhatsApp Business API',
    docsUrl: 'https://developers.facebook.com/docs/whatsapp',
    desc: 'Requer conta verificada no Meta Business e número de telefone comercial registrado.',
  },
  tiktok: {
    platform: 'TikTok for Developers',
    docsUrl: 'https://developers.tiktok.com/doc/content-posting-api-get-started',
    desc: 'Requer app registrado no TikTok Developer Portal com escopo de publicação de conteúdo.',
  },
  x: {
    platform: 'X Developer Portal',
    docsUrl: 'https://developer.x.com/en/docs/x-api',
    desc: 'Requer conta de desenvolvedor no X (Twitter) com OAuth 2.0 PKCE ativado.',
  },
  linkedin: {
    platform: 'LinkedIn Developer',
    docsUrl: 'https://learn.microsoft.com/en-us/linkedin/marketing/',
    desc: 'Requer app no LinkedIn Developer Portal com permissão de compartilhamento de páginas ou perfis.',
  },
};

type ConnectionStatus = {
  connected: boolean;
  accountName?: string;
  connectedAt?: string;
};

import { SocialLogo } from '@/components/social-logos';

export function ChannelsView({
  initialConnections,
  agentId,
  agentName,
  canEdit = true,
}: {
  initialConnections?: Record<Channel, ConnectionStatus>;
  agentId: string;
  agentName: string;
  canEdit?: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const action = useAction();
  const [connections, setConnections] = useState<Record<string, ConnectionStatus>>(
    initialConnections || {
      instagram: { connected: false },
      facebook: { connected: false },
      whatsapp: { connected: false },
      tiktok: { connected: false },
      x: { connected: false },
      linkedin: { connected: false },
    },
  );
  const [activeModal, setActiveModal] = useState<Channel | null>(null);
  const [accountHandle, setAccountHandle] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [externalIdInput, setExternalIdInput] = useState('');

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === 'social_connected') {
        const { channel, accountName } = event.data;
        if (channel) {
          setConnections((prev) => ({
            ...prev,
            [channel]: {
              connected: true,
              accountName: accountName || `@${channel}_oficial`,
              connectedAt: new Date().toISOString(),
            },
          }));
          setActiveModal(null);
        }
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  function openOAuthPopup(channel: Channel, reauth = false) {
    const width = 560;
    const height = 680;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    const url = `/api/auth/social/meta/authorize?agent=${encodeURIComponent(agentId)}&channel=${encodeURIComponent(channel)}${reauth ? '&reauth=1' : ''}`;
    window.open(
      url,
      `Conectar ${channel}`,
      `width=${width},height=${height},top=${top},left=${left},status=no,resizable=yes`,
    );
  }

  function openConnectModal(channel: Channel) {
    setActiveModal(channel);
    setAccountHandle(`@minha_empresa_${channel}`);
    setTokenInput('');
    setExternalIdInput('');
  }

  async function handleConnect(channel: Channel, isTest = false) {
    await action.act(async () => {
      const handle = isTest ? `@demo_${channel}` : accountHandle.trim() || `@${channel}_oficial`;
      const res = await api('channels', 'POST', {
        agent_id: agentId,
        channel,
        action: 'connect',
        account_name: handle,
        token: isTest ? 'test_simulation_token' : tokenInput.trim() || 'active_token',
        external_id: isTest ? 'test_external_id' : externalIdInput.trim() || undefined,
      });
      setConnections((prev) => ({
        ...prev,
        [channel]: {
          connected: true,
          accountName: res.accountName || handle,
          connectedAt: new Date().toISOString(),
        },
      }));
      setActiveModal(null);
    }, 'saved');
  }

  async function handleDisconnect(channel: Channel) {
    if (!window.confirm(t('disconnectConfirm'))) return;
    await action.act(async () => {
      await api('channels', 'POST', {
        agent_id: agentId,
        channel,
        action: 'disconnect',
      });
      setConnections((prev) => ({
        ...prev,
        [channel]: { connected: false },
      }));
    }, 'saved');
  }

  return (
    <>
      <div className="page-heading">
        <h2>{agentName}</h2>
        <p>{t('connectInfo')}</p>
      </div>

      <Notice {...action} />

      <div className="grid three channels-grid">
        {Object.entries(channels).map(([id, c]) => {
          const ch = id as Channel;
          const conn = connections[ch];
          const isConnected = !!conn?.connected;
          const info = oauthInfo[id];

          return (
            <Card key={id} className={`channel-module-card${isConnected ? ' is-connected' : ''}`}>
              <div className="channel-card-header">
                <div className="channel-title-with-logo">
                  <div className="channel-logo-wrapper">
                    <SocialLogo channel={id} size={28} />
                  </div>
                  <div>
                    <h2>{c.name}</h2>
                    <span className="channel-ratio-badge">{c.ratio}</span>
                  </div>
                </div>
                {isConnected ? (
                  <span className="channel-connected-badge" title={t('connected')}>
                    <ShieldCheck size={16} />
                  </span>
                ) : (
                  <span className="channel-status-pill">{t('notConnected')}</span>
                )}
              </div>

              <p className="check">
                <Check size={18} color="var(--success)" />
                {t('generation')}
              </p>

              <div className="channel-status">
                <span className={`dot${isConnected ? ' on' : ''}`} />
                <span>
                  {isConnected
                    ? `${t('connectedAs')}: ${conn.accountName || c.name}`
                    : t('notConnected')}
                </span>
              </div>

              {isConnected && conn.connectedAt ? (
                <small className="muted" style={{ display: 'block', marginBottom: 8 }}>
                  {new Date(conn.connectedAt).toLocaleDateString(locale)}
                </small>
              ) : (
                <p className="muted" style={{ fontSize: '0.82rem' }}>
                  {info?.desc || t('connectInfo')}
                </p>
              )}

              <div className="channel-actions">
                {isConnected ? (
                  <>
                    <Button
                      secondary
                      disabled={!canEdit || action.busy}
                      onClick={() => handleDisconnect(ch)}
                      title={t('disconnect')}
                    >
                      <Unlink size={15} />
                      {t('disconnect')}
                    </Button>
                    <Link className="button secondary" href="/contents?new=1">
                      <Plus size={15} />
                      {t('newContent')}
                    </Link>
                  </>
                ) : (
                  <>
                    <Button disabled={!canEdit || action.busy} onClick={() => openConnectModal(ch)}>
                      <Link2 size={15} />
                      {t('connectAccount')}
                    </Button>
                    <Link className="button secondary" href="/contents">
                      {t('contents')}
                    </Link>
                  </>
                )}
              </div>

              {info ? (
                <a
                  href={info.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="muted"
                  style={{
                    fontSize: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    marginTop: 12,
                    textDecoration: 'none',
                  }}
                >
                  <ExternalLink size={12} />
                  {info.platform} · {t('officialDocs')}
                </a>
              ) : null}
            </Card>
          );
        })}
      </div>

      {activeModal ? (
        <Modal
          title={`${t('connectAccount')} — ${channels[activeModal]?.name}`}
          onClose={() => setActiveModal(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                background: 'var(--canvas)',
                padding: '12px 14px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                fontSize: '0.85rem',
              }}
            >
              <strong>{oauthInfo[activeModal]?.platform}:</strong> {oauthInfo[activeModal]?.desc}
              <div style={{ marginTop: 8 }}>
                <a
                  href={oauthInfo[activeModal]?.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    color: 'var(--primary)',
                    fontSize: '0.8rem',
                  }}
                >
                  <ExternalLink size={13} />
                  {t('officialDocs')}
                </a>
              </div>
            </div>

            {activeModal === 'instagram' || activeModal === 'facebook' ? (
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(225, 48, 108, 0.08), rgba(131, 58, 180, 0.08))',
                  border: '1px solid rgba(225, 48, 108, 0.3)',
                  borderRadius: 10,
                  padding: '20px',
                  textAlign: 'center',
                }}
              >
                <div style={{ display: 'inline-flex', marginBottom: 12 }}>
                  <SocialLogo channel={activeModal} size={36} />
                </div>
                <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 600 }}>
                  Conexão Automática Oficial (1 Clique)
                </h3>
                <p
                  style={{
                    margin: '0 auto 16px',
                    maxWidth: '380px',
                    color: 'var(--muted)',
                    fontSize: '13px',
                    lineHeight: 1.5,
                  }}
                >
                  Clique no botão abaixo para autorizar diretamente na Meta. O sistema capturará seu ID e token de 60 dias automaticamente.
                </p>
                <button
                  type="button"
                  onClick={() => openOAuthPopup(activeModal)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: 8,
                    background: 'linear-gradient(135deg, #e1306c, #f77737, #833ab4)',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow: '0 4px 12px rgba(225, 48, 108, 0.25)',
                  }}
                >
                  <Link2 size={16} />
                  Entrar com Meta / {channels[activeModal]?.name}
                </button>
                <div style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => openOAuthPopup(activeModal, true)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--muted)',
                      fontSize: '12px',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                    title="Permite fazer login com outro perfil do Facebook / Meta"
                  >
                    <Unlink size={13} />
                    Trocar de conta da Meta (Entrar com outro perfil)
                  </button>
                </div>
              </div>
            ) : null}

            <details
              open={activeModal !== 'instagram' && activeModal !== 'facebook'}
              style={{
                marginTop: activeModal === 'instagram' || activeModal === 'facebook' ? 8 : 0,
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '12px 14px',
                background: 'var(--canvas)',
              }}
            >
              <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '13px', color: 'var(--foreground)' }}>
                {activeModal === 'instagram' || activeModal === 'facebook'
                  ? 'Configuração manual (Inserir Token e ID)'
                  : 'Configurar Credenciais do Canal'}
              </summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
                <Field label={t('accountName')}>
                  <input
                    type="text"
                    value={accountHandle}
                    onChange={(e) => setAccountHandle(e.target.value)}
                    placeholder={`@sua_empresa_${activeModal}`}
                  />
                </Field>

                <Field label="ID da Conta / Página (Opcional)">
                  <input
                    type="text"
                    value={externalIdInput}
                    onChange={(e) => setExternalIdInput(e.target.value)}
                    placeholder={
                      activeModal === 'instagram'
                        ? 'Instagram Business Account ID (ex: 17841400000000000)'
                        : activeModal === 'facebook'
                          ? 'Facebook Page ID (ex: 100085000000000)'
                          : activeModal === 'linkedin'
                            ? 'Organization ID (ex: 12345678) ou Profile URN'
                            : 'ID externo da conta'
                    }
                  />
                </Field>

                <Field label={t('accessToken')}>
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="Token de acesso oficial ou chave de API"
                  />
                </Field>

                <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                  <Button busy={action.busy} onClick={() => handleConnect(activeModal, false)}>
                    <Link2 size={16} />
                    {t('connectAccount')}
                  </Button>
                  <Button secondary busy={action.busy} onClick={() => handleConnect(activeModal, true)}>
                    {t('testConnection')}
                  </Button>
                </div>
              </div>
            </details>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
