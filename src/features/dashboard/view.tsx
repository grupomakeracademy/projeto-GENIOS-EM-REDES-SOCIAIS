'use client';
import Link from 'next/link';
import {
  FileText,
  CircleCheck,
  CalendarDays,
  Clock,
  Bot,
  Info,
} from 'lucide-react';
import { Card, Empty, StatusBadge, useT, useLocale } from '@/components/ui';
import { SocialLogo } from '@/components/social-logos';
import { type Channel } from '@/lib/domain';

export function Dashboard({
  name,
  counts,
  recent,
  agents,
  upcoming,
  agentId,
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
}) {
  const t = useT(),
    locale = useLocale();

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

  return (
    <div className="dashboard-container">
      {/* Top Welcome Header */}
      <div className="dashboard-header">
        <div className="dashboard-welcome">
          <h1>Olá, {name}!</h1>
          <p>{t('overview')}</p>
        </div>

      </div>

      {/* 4 Stat Cards */}
      <div className="grid four dashboard-stats-grid">
        {statConfigs.map((cfg, i) => {
          const Icon = cfg.icon;
          return (
            <Card className="dash-stat-card" key={i}>
              <div
                className="dash-stat-icon-container"

              >
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

      {/* Main Row: Performance Chart + Recent Contents */}
      <div className="dashboard-main-grid">
        {/* Performance Chart Card */}
        <Card className="dash-chart-card">
          <div className="dash-card-header">
            <div className="dash-chart-title">
              <h2>{t('performance')}</h2>
              <span
                className="dash-info-badge"
                title="Métricas consolidadas de alcance, engajamento e público"
              >
                <Info size={14} />
              </span>
            </div>
            <div className="dash-chart-legend">
              <span className="legend-item">
                <span className="legend-dot" style={{ background: '#2563eb' }} />
                {t('reach')}
              </span>
              <span className="legend-item">
                <span className="legend-dot" style={{ background: '#10b981' }} />
                {t('engagement')}
              </span>
              <span className="legend-item">
                <span className="legend-dot" style={{ background: '#8b5cf6' }} />
                {t('followers')}
              </span>
            </div>
          </div>

          <Empty title="Métricas de alcance, engajamento e seguidores ainda não disponíveis para as contas selecionadas." />
        </Card>

        {/* Recent Contents Card */}
        <Card className="dash-recent-card">
          <div className="dash-card-header">
            <h2>{t('recent')}</h2>
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

      {/* Bottom 3 Summary Blocks */}
      <div className="grid three dashboard-bottom-grid">
        {/* Active Agents */}
        <Card className="dash-bottom-card">
          <div className="dash-bottom-header">
            <div className="dash-bottom-icon-title">
              <div
                className="dash-bottom-icon-box"

              >
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
              <div
                className="dash-bottom-icon-box"

              >
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
                · {c.scheduled_at ? new Date(c.scheduled_at).toLocaleString(locale) : ''}
              </small>
            </p>
          ))}
          {!upcoming.length && <p className="muted">Nenhum conteúdo agendado.</p>}
        </Card>
      </div>
    </div>
  );
}
