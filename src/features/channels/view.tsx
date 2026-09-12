'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Check, Link2, ExternalLink, Unlink, Plus, ShieldCheck } from 'lucide-react';
import { channels, type Channel } from '@/lib/domain';
import { Button, Card, Modal, Field, Notice, useT, useLocale, useAction, api } from '@/components/ui';

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
  canEdit = true,
}: {
  initialConnections?: Record<Channel, ConnectionStatus>;
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

  function openConnectModal(channel: Channel) {
    setActiveModal(channel);
    setAccountHandle(`@minha_empresa_${channel}`);
    setTokenInput('');
  }

  async function handleConnect(channel: Channel, isTest = false) {
    await action.act(async () => {
      const handle = isTest
        ? `@demo_${channel}`
        : accountHandle.trim() || `@${channel}_oficial`;
      const res = await api('channels', 'POST', {
        channel,
        action: 'connect',
        account_name: handle,
        token: isTest ? 'test_simulation_token' : tokenInput.trim() || 'active_token',
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
        <h1>{t('channels')}</h1>
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
                    <Button
                      disabled={!canEdit || action.busy}
                      onClick={() => openConnectModal(ch)}
                    >
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

            <Field label={t('accountName')}>
              <input
                type="text"
                value={accountHandle}
                onChange={(e) => setAccountHandle(e.target.value)}
                placeholder={`@sua_empresa_${activeModal}`}
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

            <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
              <Button
                busy={action.busy}
                onClick={() => handleConnect(activeModal, false)}
              >
                <Link2 size={16} />
                {t('connectAccount')}
              </Button>
              <Button
                secondary
                busy={action.busy}
                onClick={() => handleConnect(activeModal, true)}
              >
                {t('testConnection')}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
