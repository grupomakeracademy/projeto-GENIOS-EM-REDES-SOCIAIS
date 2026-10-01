'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  FileText,
  CircleCheck,
  CalendarDays,
  Clock,
  Bot,
  Info,
  RefreshCw,
  ExternalLink,
  Users,
  Heart,
  MessageCircle,
  Share2,
  TrendingUp,
} from 'lucide-react';
import { Card, Empty, StatusBadge, useT, useLocale } from '@/components/ui';
import { SocialLogo } from '@/components/social-logos';
import { type Channel } from '@/lib/domain';
import { type SocialAnalyticsSummary } from '@/lib/social/analytics';

export function Dashboard({
  name,
  counts,
  recent,
  agents,
  upcoming,
  agentId,
  socialAnalytics: initialSocialAnalytics,
}: {
  name: string;
  agentId: string;
  upcoming: { id: string; topic: string; scheduled_at: string | null }[];
  counts: number[];
  recent: {
    id: string;
    topic: string;
    status: string;
    created_at: string;
    content_variants?: { channel: Channel }[];
  }[];
  agents: number;
  runs: { id: string; stage: string; status: string; error_code: string | null }[];
  socialAnalytics?: SocialAnalyticsSummary;
}) {
  const t = useT(),
    locale = useLocale();

  const [socialData, setSocialData] = useState<SocialAnalyticsSummary | undefined>(
    initialSocialAnalytics,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  const statConfigs = [
    {
      icon: FileText,
      label: t('totalContent'),
    },
    {
      icon: CircleCheck,
      label: t('published'),
    },
    {
      icon: CalendarDays,
      label: t('scheduled'),
    },
    {
      icon: Clock,
      label: t('review'),
    },
  ];

  async function handleRefreshSocial() {
    setIsRefreshing(true);
    setRefreshMessage(null);
    try {
      const q = agentId ? `?agent=${agentId}` : '';
      const res = await fetch(`/api/analytics/social/refresh${q}`, {
        method: 'POST',
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setSocialData(json.data);
          setRefreshMessage('Métricas atualizadas com sucesso!');
          setTimeout(() => setRefreshMessage(null), 4000);
        }
      } else {
        setRefreshMessage('Não foi possível sincronizar no momento.');
      }
    } catch {
      setRefreshMessage('Erro de conexão ao sincronizar.');
    } finally {
      setIsRefreshing(false);
    }
  }

  const connections = socialData?.connections || [];
  const totals = socialData?.totals || {
    followers: 0,
    media: 0,
    interactions: 0,
    connectedCount: 0,
    avgEngagementRate: '0%',
  };

  // Find max value for bar height scaling
  const maxFollowers = Math.max(...connections.map((c) => c.followers), 1);
  const maxInteractions = Math.max(...connections.map((c) => c.totalInteractions), 1);
  const maxMedia = Math.max(...connections.map((c) => c.totalMedia), 1);

  // All recent posts from all connected channels sorted by date
  const allSocialPosts = connections
    .flatMap((c) =>
      c.recentPosts.map((p) => ({
        ...p,
        channel: c.channel,
        accountName: c.accountName,
      })),
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 6);

  return (
    <div className="dashboard-container">
      {/* Top Welcome Header */}
      <div className="dashboard-header">
        <div className="dashboard-welcome">
          <h1>Olá, {name}!</h1>
          <p>{t('overview')}</p>
        </div>

        {/* Sync Action */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {refreshMessage && (
            <span style={{ fontSize: '13px', color: '#10b981', fontWeight: 600 }}>
              {refreshMessage}
            </span>
          )}
          <button
            type="button"
            className="button secondary"
            onClick={handleRefreshSocial}
            disabled={isRefreshing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              cursor: isRefreshing ? 'wait' : 'pointer',
            }}
          >
            <RefreshCw
              size={15}
              style={{
                animation: isRefreshing ? 'spin 1s linear infinite' : 'none',
              }}
            />
            {isRefreshing ? 'Sincronizando...' : 'Sincronizar Redes'}
          </button>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid four dashboard-stats-grid">
        {statConfigs.map((cfg, i) => {
          const Icon = cfg.icon;
          return (
            <Card className="dash-stat-card" key={i}>
              <div className="dash-stat-icon-container">
                <Icon size={24} />
              </div>
              <div className="dash-stat-body">
                <span className="dash-stat-label">{cfg.label}</span>
                <strong className="dash-stat-number">
                  {counts[i]?.toLocaleString(locale) ?? 0}
                </strong>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Redes Sociais Conectadas - Cards Resumo */}
      <div style={{ marginBottom: '24px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Share2 size={18} style={{ color: 'var(--primary, #0284c7)' }} />
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
              Redes Sociais Conectadas
            </h2>
            <span
              style={{
                fontSize: '12px',
                padding: '2px 8px',
                borderRadius: '12px',
                background: connections.length > 0 ? '#ecfdf5' : '#f1f5f9',
                color: connections.length > 0 ? '#059669' : '#64748b',
                fontWeight: 600,
              }}
            >
              {connections.length} {connections.length === 1 ? 'conta ativa' : 'contas ativas'}
            </span>
          </div>

          <Link
            href="/channels"
            style={{
              fontSize: '13px',
              color: 'var(--primary, #0284c7)',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Gerenciar canais ↗
          </Link>
        </div>

        {connections.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '16px',
            }}
          >
            {connections.map((conn) => (
              <Card
                key={conn.id}
                style={{
                  padding: '18px 20px',
                  borderRadius: '14px',
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                {/* Header da conta */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ position: 'relative', width: '48px', height: '48px' }}>
                    {conn.profilePicUrl ? (
                      <img
                        src={conn.profilePicUrl}
                        alt={conn.accountName}
                        style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '50%',
                          objectFit: 'cover',
                          border: '2px solid var(--border)',
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '50%',
                          background: 'var(--canvas, #f8fafc)',
                          display: 'grid',
                          placeItems: 'center',
                          border: '2px solid var(--border)',
                        }}
                      >
                        <SocialLogo channel={conn.channel} size={24} />
                      </div>
                    )}
                    <span
                      style={{
                        position: 'absolute',
                        bottom: '-2px',
                        right: '-2px',
                        background: '#ffffff',
                        borderRadius: '50%',
                        padding: '2px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                        display: 'flex',
                      }}
                    >
                      <SocialLogo channel={conn.channel} size={14} />
                    </span>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <strong
                        style={{
                          fontSize: '0.95rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {conn.displayName || conn.accountName}
                      </strong>
                      <span
                        style={{
                          display: 'inline-block',
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: '#10b981',
                        }}
                        title="Conexão ativa"
                      />
                    </div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                      {conn.accountName}
                    </span>
                  </div>

                  {conn.profileUrl && (
                    <a
                      href={conn.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: 'var(--muted)',
                        padding: '6px',
                        borderRadius: '6px',
                        display: 'flex',
                      }}
                      title="Abrir perfil na rede social"
                    >
                      <ExternalLink size={16} />
                    </a>
                  )}
                </div>

                {/* Métricas rápidas */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '8px',
                    padding: '12px',
                    borderRadius: '10px',
                    background: 'var(--canvas, #f8fafc)',
                    textAlign: 'center',
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        color: 'var(--muted)',
                        display: 'block',
                        fontWeight: 600,
                      }}
                    >
                      Seguidores
                    </span>
                    <strong style={{ fontSize: '1.05rem', color: '#8b5cf6' }}>
                      {conn.followers.toLocaleString(locale)}
                    </strong>
                  </div>

                  <div>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        color: 'var(--muted)',
                        display: 'block',
                        fontWeight: 600,
                      }}
                    >
                      Publicações
                    </span>
                    <strong style={{ fontSize: '1.05rem', color: '#2563eb' }}>
                      {conn.totalMedia.toLocaleString(locale)}
                    </strong>
                  </div>

                  <div>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        color: 'var(--muted)',
                        display: 'block',
                        fontWeight: 600,
                      }}
                    >
                      Engajamento
                    </span>
                    <strong style={{ fontSize: '1.05rem', color: '#10b981' }}>
                      {conn.engagementRate !== '0%'
                        ? conn.engagementRate
                        : `${conn.totalInteractions} ações`}
                    </strong>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card style={{ padding: '24px', textAlign: 'center' }}>
            <p style={{ color: 'var(--muted)', margin: '0 0 12px' }}>
              Nenhuma rede social conectada para sincronização ao vivo.
            </p>
            <Link className="button primary" href="/channels">
              Conectar Instagram ou Facebook
            </Link>
          </Card>
        )}
      </div>

      {/* Main Row: Performance Chart + Recent Contents */}
      <div className="dashboard-main-grid">
        {/* Performance Chart Card */}
        <Card className="dash-chart-card">
          <div className="dash-card-header">
            <div className="dash-chart-title">
              <h2>{t('performance')} das Redes</h2>
              <span
                className="dash-info-badge"
                title="Métricas consolidadas de seguidores, interações e publicações das contas conectadas"
              >
                <Info size={14} />
              </span>
            </div>
            <div className="dash-chart-legend">
              <span className="legend-item">
                <span className="legend-dot" style={{ background: '#8b5cf6' }} />
                {t('followers')}
              </span>
              <span className="legend-item">
                <span className="legend-dot" style={{ background: '#10b981' }} />
                {t('engagement')} (Ações)
              </span>
              <span className="legend-item">
                <span className="legend-dot" style={{ background: '#2563eb' }} />
                Publicações
              </span>
            </div>
          </div>

          {connections.length > 0 ? (
            <div>
              {/* KPIs Consolidados */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '12px',
                  marginBottom: '24px',
                  paddingBottom: '16px',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block' }}>
                    Seguidores Totais
                  </span>
                  <strong style={{ fontSize: '1.35rem', color: '#8b5cf6', fontWeight: 800 }}>
                    {totals.followers.toLocaleString(locale)}
                  </strong>
                </div>

                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block' }}>
                    Interações Recentes
                  </span>
                  <strong style={{ fontSize: '1.35rem', color: '#10b981', fontWeight: 800 }}>
                    {totals.interactions.toLocaleString(locale)}
                  </strong>
                </div>

                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block' }}>
                    Publicações nas Redes
                  </span>
                  <strong style={{ fontSize: '1.35rem', color: '#2563eb', fontWeight: 800 }}>
                    {totals.media.toLocaleString(locale)}
                  </strong>
                </div>

                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block' }}>
                    Taxa Média de Engajamento
                  </span>
                  <strong style={{ fontSize: '1.35rem', color: 'var(--foreground)', fontWeight: 800 }}>
                    {totals.avgEngagementRate}
                  </strong>
                </div>
              </div>

              {/* Gráfico Comparativo por Canal Conectado */}
              <div className="dash-chart-wrapper" style={{ height: '220px' }}>
                <div className="dash-chart-bars-area">
                  <div className="dash-grid-lines">
                    <div className="grid-line" style={{ top: '0%' }} />
                    <div className="grid-line" style={{ top: '33%' }} />
                    <div className="grid-line" style={{ top: '66%' }} />
                    <div className="grid-line" style={{ top: '100%' }} />
                  </div>

                  <div
                    className="dash-bars-columns"
                    style={{ height: '170px', display: 'flex', justifyContent: 'space-around' }}
                  >
                    {connections.map((c) => {
                      const fHeight = Math.max(Math.round((c.followers / maxFollowers) * 130), 12);
                      const iHeight = Math.max(
                        Math.round((c.totalInteractions / maxInteractions) * 130),
                        8,
                      );
                      const mHeight = Math.max(Math.round((c.totalMedia / maxMedia) * 130), 10);

                      return (
                        <div key={c.id} className="dash-bar-group" style={{ width: '22%' }}>
                          <div
                            className="dash-bars-container"
                            style={{ height: '140px', justifyContent: 'center', gap: '6px' }}
                          >
                            <div
                              className="bar bar-purple"
                              style={{ height: `${fHeight}px`, width: '12px' }}
                              title={`Seguidores: ${c.followers}`}
                            />
                            <div
                              className="bar bar-green"
                              style={{ height: `${iHeight}px`, width: '12px' }}
                              title={`Interações recentes: ${c.totalInteractions}`}
                            />
                            <div
                              className="bar bar-blue"
                              style={{ height: `${mHeight}px`, width: '12px' }}
                              title={`Publicações: ${c.totalMedia}`}
                            />
                          </div>
                          <div className="dash-channel-footer" style={{ marginTop: '8px' }}>
                            <div className="dash-channel-logo">
                              <SocialLogo channel={c.channel} size={16} />
                            </div>
                            <span className="dash-channel-name" style={{ fontSize: '11px' }}>
                              {c.accountName}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <Empty title="Métricas de alcance, engajamento e seguidores ainda não disponíveis para as contas selecionadas." />
          )}
        </Card>

        {/* Recent Contents Card (Internos do Workspace) */}
        <Card className="dash-recent-card">
          <div className="dash-card-header">
            <h2>{t('recent')} (Conteúdos no Sistema)</h2>
            <Link
              href={agentId ? `/contents?agent=${agentId}` : '/contents'}
              className="dash-view-all-link"
            >
              {t('viewAll')}
            </Link>
          </div>

          {recent.length ? (
            <div className="dash-recent-list">
              {recent.map((c) => {
                const assignedChannel = c.content_variants?.[0]?.channel;
                return (
                  <div key={c.id} className="dash-recent-item">
                    <div className="dash-recent-thumb-wrapper">
                      <div className="dash-recent-thumb">
                        <FileText size={18} color="var(--muted)" />
                      </div>
                      <span className="dash-recent-logo-badge">
                        {assignedChannel && <SocialLogo channel={assignedChannel} size={14} />}
                      </span>
                    </div>
                    <div className="dash-recent-text">
                      <Link href={`/contents/${c.id}`} className="dash-recent-title">
                        <strong>{c.topic || t(c.status)}</strong>
                      </Link>
                      <p className="dash-recent-date">
                        {new Date(c.created_at).toLocaleString(locale, {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: '24px 0' }}>
              <Empty title={t('emptyContent')}>
                <Link
                  className="button secondary"
                  href={agentId ? `/agents?agent=${agentId}` : '/agents'}
                >
                  {t('configureGenie')}
                </Link>
              </Empty>
            </div>
          )}
        </Card>
      </div>

      {/* Seção Extra: Últimas Postagens ao Vivo nas Redes */}
      {allSocialPosts.length > 0 && (
        <div style={{ marginTop: '24px', marginBottom: '24px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={18} style={{ color: '#10b981' }} />
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
                Últimas Publicações nas Redes Sociais
              </h2>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '16px',
            }}
          >
            {allSocialPosts.map((post) => (
              <Card
                key={post.id}
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <SocialLogo channel={post.channel} size={15} />
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)' }}>
                        {post.accountName}
                      </span>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      {new Date(post.date).toLocaleDateString(locale, {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </span>
                  </div>

                  <p
                    style={{
                      fontSize: '13px',
                      color: 'var(--foreground)',
                      margin: 0,
                      lineHeight: '1.4',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {post.caption || 'Sem legenda'}
                  </p>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: '10px',
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '12px',
                        color: '#ef4444',
                        fontWeight: 600,
                      }}
                    >
                      <Heart size={14} />
                      {post.likes}
                    </span>
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '12px',
                        color: 'var(--muted)',
                        fontWeight: 600,
                      }}
                    >
                      <MessageCircle size={14} />
                      {post.comments}
                    </span>
                  </div>

                  {post.url && (
                    <a
                      href={post.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: '12px',
                        color: 'var(--primary, #0284c7)',
                        textDecoration: 'none',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      Ver post ↗
                    </a>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Bottom 3 Summary Blocks */}
      <div className="grid three dashboard-bottom-grid">
        {/* Active Agents */}
        <Card className="dash-bottom-card">
          <div className="dash-bottom-header">
            <div className="dash-bottom-icon-title">
              <div className="dash-bottom-icon-box">
                <Bot size={22} />
              </div>
              <div>
                <h3>{t('activeAgents')}</h3>
                <p className="dash-bottom-meta">
                  <strong>{agents}</strong> {t('activeAgentsCount')}
                </p>
              </div>
            </div>
            <Link href="/agents" className="dash-action-btn">
              {t('manageAgents')}
            </Link>
          </div>
        </Card>

        {/* Upcoming Content */}
        <Card className="dash-bottom-card">
          <div className="dash-bottom-header">
            <div className="dash-bottom-icon-title">
              <div className="dash-bottom-icon-box">
                <CalendarDays size={22} />
              </div>
              <div>
                <h3>{t('upcoming')}</h3>
                <p className="dash-bottom-meta">
                  <strong>{counts[2] || 0}</strong> {t('scheduled')}
                </p>
              </div>
            </div>
            <Link
              href={agentId ? `/calendar?agent=${agentId}` : '/calendar'}
              className="dash-action-btn"
            >
              {t('viewCalendar')}
            </Link>
          </div>
        </Card>

        <Card>
          <h3>Próximos conteúdos</h3>
          {upcoming.map((c) => (
            <p key={c.id}>
              <Link href={`/contents/${c.id}`}>{c.topic}</Link>
              <small>
                {' '}
                — {c.scheduled_at ? new Date(c.scheduled_at).toLocaleString(locale) : ''}
              </small>
            </p>
          ))}
          {!upcoming.length && <p className="muted">Nenhum conteúdo agendado.</p>}
        </Card>
      </div>
    </div>
  );
}
