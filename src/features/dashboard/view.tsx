'use client';
import Link from 'next/link';
import {
  FileText,
  SquareCheck,
  CalendarDays,
  Clock,
  Bot,
  TrendingUp,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { Card, Empty, StatusBadge, useT, useLocale } from '@/components/ui';
import { SocialLogo } from '@/components/social-logos';
import { channels, type Channel } from '@/lib/domain';

export function Dashboard({
  name,
  counts,
  recent,
  agents,
  runs,
}: {
  name: string;
  counts: number[];
  recent: { id: string; topic: string; status: string; created_at: string }[];
  agents: number;
  runs: { id: string; stage: string; status: string; error_code: string | null }[];
}) {
  const t = useT(),
    locale = useLocale();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const dateRangeStr = `${startOfMonth.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })} – ${endOfMonth.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })}`;

  const statConfigs = [
    {
      icon: FileText,
      label: t('totalContent'),
      color: '#2563eb',
      bg: '#eff6ff',
      trend: '+12%',
    },
    {
      icon: SquareCheck,
      label: t('published'),
      color: '#10b981',
      bg: '#ecfdf5',
      trend: '+18%',
    },
    {
      icon: CalendarDays,
      label: t('scheduled'),
      color: '#8b5cf6',
      bg: '#f5f3ff',
      trend: '+24%',
    },
    {
      icon: Clock,
      label: t('review'),
      color: '#f43f5e',
      bg: '#fff1f2',
      trend: '+9%',
    },
  ];

  const chartChannels: { id: Channel; name: string; alcance: number; engajamento: number; seguidores: number }[] = [
    { id: 'instagram', name: 'Instagram', alcance: 38, engajamento: 8, seguidores: 20 },
    { id: 'facebook', name: 'Facebook', alcance: 26, engajamento: 7, seguidores: 15 },
    { id: 'whatsapp', name: 'WhatsApp', alcance: 16, engajamento: 5, seguidores: 8 },
    { id: 'tiktok', name: 'TikTok', alcance: 26, engajamento: 9, seguidores: 15 },
    { id: 'x', name: 'X', alcance: 12, engajamento: 4, seguidores: 7 },
    { id: 'linkedin', name: 'LinkedIn', alcance: 22, engajamento: 7, seguidores: 12 },
  ];

  return (
    <div className="dashboard-container">
      {/* Top Welcome Header */}
      <div className="dashboard-header">
        <div className="dashboard-welcome">
          <h1>Olá, {name}! 👋</h1>
          <p>{t('overview')}</p>
        </div>
        <div className="dashboard-date-badge">
          <CalendarDays size={16} color="var(--muted)" />
          <span>{dateRangeStr}</span>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid four dashboard-stats-grid">
        {statConfigs.map((cfg, i) => {
          const Icon = cfg.icon;
          return (
            <Card className="dash-stat-card" key={i}>
              <div className="dash-stat-icon-container" style={{ background: cfg.bg, color: cfg.color }}>
                <Icon size={24} />
              </div>
              <div className="dash-stat-body">
                <span className="dash-stat-label">{cfg.label}</span>
                <strong className="dash-stat-number">{counts[i]?.toLocaleString(locale) ?? 0}</strong>
                <div className="dash-stat-trend">
                  <span className="dash-stat-badge">
                    <TrendingUp size={12} />
                    {cfg.trend}
                  </span>
                  <span className="dash-stat-subtext">{t('relativeToLastMonth')}</span>
                </div>
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
              <span className="dash-info-badge" title="Métricas consolidadas de alcance, engajamento e público">
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

          <div className="dash-chart-wrapper">
            {/* Y Axis Grid lines */}
            <div className="dash-chart-y-axis">
              <span>50K</span>
              <span>40K</span>
              <span>30K</span>
              <span>20K</span>
              <span>10K</span>
              <span>0</span>
            </div>
            <div className="dash-chart-bars-area">
              <div className="dash-grid-lines">
                <div className="grid-line" />
                <div className="grid-line" />
                <div className="grid-line" />
                <div className="grid-line" />
                <div className="grid-line" />
                <div className="grid-line" />
              </div>

              {/* Grouped Bars per Network */}
              <div className="dash-bars-columns">
                {chartChannels.map((item) => (
                  <div key={item.id} className="dash-bar-group">
                    <div className="dash-bars-container">
                      <div
                        className="bar bar-blue"
                        style={{ height: `${(item.alcance / 50) * 100}%` }}
                        title={`${t('reach')}: ${item.alcance}k`}
                      />
                      <div
                        className="bar bar-green"
                        style={{ height: `${(item.engajamento / 50) * 100}%` }}
                        title={`${t('engagement')}: ${item.engajamento}k`}
                      />
                      <div
                        className="bar bar-purple"
                        style={{ height: `${(item.seguidores / 50) * 100}%` }}
                        title={`${t('followers')}: ${item.seguidores}k`}
                      />
                    </div>
                    <div className="dash-channel-footer">
                      <div className="dash-channel-logo">
                        <SocialLogo channel={item.id} size={22} />
                      </div>
                      <span className="dash-channel-name">{item.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Recent Contents Card */}
        <Card className="dash-recent-card">
          <div className="dash-card-header">
            <h2>{t('recent')}</h2>
            <Link href="/contents" className="dash-view-all-link">
              {t('viewAll')}
            </Link>
          </div>

          {recent.length ? (
            <div className="dash-recent-list">
              {recent.map((c, idx) => {
                const channelKeys = Object.keys(channels) as Channel[];
                const assignedChannel = channelKeys[idx % channelKeys.length];
                return (
                  <div key={c.id} className="dash-recent-item">
                    <div className="dash-recent-thumb-wrapper">
                      <div className="dash-recent-thumb">
                        <FileText size={18} color="#64748b" />
                      </div>
                      <span className="dash-recent-logo-badge">
                        <SocialLogo channel={assignedChannel} size={14} />
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
                <Link className="button secondary" href="/agents">
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
              <div className="dash-bottom-icon-box" style={{ background: '#eff6ff', color: '#2563eb' }}>
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
          <div className="dash-agents-logos">
            {Object.keys(channels).map((ch) => (
              <div key={ch} className="dash-network-mini-badge" title={channels[ch as Channel]?.name}>
                <SocialLogo channel={ch} size={18} />
              </div>
            ))}
          </div>
        </Card>

        {/* Upcoming Content */}
        <Card className="dash-bottom-card">
          <div className="dash-bottom-header">
            <div className="dash-bottom-icon-title">
              <div className="dash-bottom-icon-box" style={{ background: '#ecfdf5', color: '#10b981' }}>
                <CalendarDays size={22} />
              </div>
              <div>
                <h3>{t('upcoming')}</h3>
                <p className="dash-bottom-meta">
                  <strong>{counts[2] || 0}</strong> {t('scheduledForThisWeek')}
                </p>
              </div>
            </div>
            <Link href="/calendar" className="dash-action-btn">
              {t('viewCalendar')}
            </Link>
          </div>
        </Card>

        {/* Briefing Status */}
        <Card className="dash-bottom-card">
          <div className="dash-bottom-header">
            <div className="dash-bottom-icon-title">
              <div className="dash-bottom-icon-box" style={{ background: '#f5f3ff', color: '#8b5cf6' }}>
                <FileText size={22} />
              </div>
              <div>
                <h3>{t('history')}</h3>
                <div className="dash-briefing-status">
                  <CheckCircle2 size={16} color="#10b981" />
                  <span>{t('briefingConfigured')}</span>
                </div>
                <p className="dash-bottom-meta" style={{ fontSize: '0.75rem', marginTop: 2 }}>
                  {runs.length
                    ? `${t('lastUpdate')} ${new Date().toLocaleDateString(locale)}`
                    : `${t('lastUpdate')} ${new Date().toLocaleDateString(locale)}`}
                </p>
              </div>
            </div>
            <Link href="/agents" className="dash-action-btn">
              {t('editBriefing')}
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
