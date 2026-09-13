'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { DateTime } from 'luxon';
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  ThumbsUp,
  XCircle,
} from 'lucide-react';
import { Button, Card, Empty, StatusBadge, useT, useLocale, Modal, Field } from '@/components/ui';
import { SocialLogo } from '@/components/social-logos';
import { channels, statuses, type Channel } from '@/lib/domain';

export type CalendarContentItem = {
  id: string;
  topic: string;
  status: string;
  scheduled_at: string | null;
  created_at?: string;
  content_variants?: { channel: Channel }[];
};

type CalendarProps = {
  items: CalendarContentItem[];
  upcoming: CalendarContentItem[];
  summary: {
    published: number;
    scheduled: number;
    approved: number;
    review: number;
    draft: number;
    rejected: number;
  };
  distribution: Record<string, number>;
  timezone: string;
  date: string;
};

export function Calendar({
  items,
  upcoming,
  summary,
  distribution,
  timezone,
  date,
}: CalendarProps) {
  const t = useT(),
    locale = useLocale(),
    router = useRouter(),
    params = useSearchParams(),
    [view, setView] = useState('month');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const selected = DateTime.fromISO(date, { zone: timezone }).setLocale(locale);
  const start = selected.startOf(view === 'month' ? 'month' : view === 'week' ? 'week' : 'day');
  const gridStart = view === 'month' ? start.minus({ days: start.weekday % 7 }) : start;
  const days = view === 'month' ? 42 : view === 'week' ? 7 : 1;

  function move(offset: number) {
    const p = new URLSearchParams(params);
    p.set(
      'date',
      selected
        .plus(
          view === 'month'
            ? { months: offset }
            : view === 'week'
              ? { weeks: offset }
              : { days: offset },
        )
        .toISODate()!,
    );
    router.push(`/calendar?${p}`);
  }

  const channelColorPastels: Record<string, { bg: string; text: string; border: string }> = {
    instagram: { bg: '#fdf2f8', text: '#cb319d', border: '#fbcfe8' },
    facebook: { bg: '#eff6ff', text: '#1877f2', border: '#bfdbfe' },
    whatsapp: { bg: '#f0fdf4', text: '#078c55', border: '#bbf7d0' },
    tiktok: { bg: '#f8fafc', text: '#0f172a', border: '#e2e8f0' },
    x: { bg: '#f8fafc', text: '#0f172a', border: '#e2e8f0' },
    linkedin: { bg: '#f0f9ff', text: '#0a66c2', border: '#bae6fd' },
  };

  const channelList: Channel[] = ['instagram', 'facebook', 'whatsapp', 'tiktok', 'x', 'linkedin'];
  const maxDistributionCount = Math.max(...Object.values(distribution), 1);

  return (
    <div className="cal-screen-wrapper">
      {filtersOpen && (
        <Modal title="Filtros do calendário" onClose={() => setFiltersOpen(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget),
                p = new URLSearchParams(params);
              const status = form.getAll('status').join(',');
              if (status) p.set('status', status);
              else p.delete('status');
              const network = String(form.get('network') || '');
              if (network) p.set('network', network);
              else p.delete('network');
              router.push(`/calendar?${p}`, { scroll: false });
              setFiltersOpen(false);
            }}
          >
            <Field label="Rede social">
              <select name="network" defaultValue={params.get('network') || ''}>
                <option value="">Todas as redes</option>
                {Object.entries(channels).map(([id, c]) => (
                  <option key={id} value={id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <p>Status</p>
            <div className="grid two">
              {statuses.map((s) => (
                <label className="check" key={s}>
                  <input
                    type="checkbox"
                    name="status"
                    value={s}
                    defaultChecked={(params.get('status') || '').split(',').includes(s)}
                  />
                  {t(s)}
                </label>
              ))}
            </div>
            <div className="form-row">
              <Button type="submit">Aplicar filtros</Button>
              <Button
                secondary
                type="button"
                onClick={() => {
                  const p = new URLSearchParams(params);
                  p.delete('status');
                  p.delete('network');
                  router.push(`/calendar?${p}`);
                  setFiltersOpen(false);
                }}
              >
                Limpar filtros
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {/* Page Heading */}
      <div className="page-heading cal-header">
        <h1>{t('calendar')}</h1>
        <p>{t('calendarIntro')}</p>
      </div>

      {/* Main Two-Column Layout */}
      <div className="cal-layout">
        {/* Left Area: Dominant Large Calendar */}
        <div className="cal-main-area">
          {/* Navigation & Controls Toolbar */}
          <div className="cal-toolbar">
            <div className="cal-nav-controls">
              <Button secondary aria-label={t('previous')} onClick={() => move(-1)}>
                <ChevronLeft size={18} />
              </Button>
              <Button secondary aria-label={t('following')} onClick={() => move(1)}>
                <ChevronRight size={18} />
              </Button>
              <h2 className="cal-month-title">{selected.toFormat('LLLL de yyyy')}</h2>
              <Button
                secondary
                onClick={() => {
                  const p = new URLSearchParams(params);
                  p.delete('date');
                  router.push(`/calendar?${p}`);
                }}
              >
                {t('today')}
              </Button>
            </div>

            <div className="cal-view-controls">
              <div className="tabs cal-tabs">
                {['month', 'week', 'day', 'list'].map((s) => (
                  <button className={view === s ? 'active' : ''} key={s} onClick={() => setView(s)}>
                    {t(s)}
                  </button>
                ))}
              </div>
              <Button secondary className="cal-filter-btn" onClick={() => setFiltersOpen(true)}>
                <Filter size={15} />
                <span>Filtros</span>
              </Button>
            </div>
          </div>

          {view === 'list' ? (
            <Card className="cal-card-wrapper">
              {items.length ? (
                items.map((item) => {
                  const channel = item.content_variants?.[0]?.channel || 'instagram';
                  return (
                    <div className="list-row cal-list-item" key={item.id}>
                      <div className="cal-list-info">
                        <SocialLogo channel={channel} size={18} />
                        <Link href={`/contents/${item.id}`} className="cal-list-title">
                          {item.topic}
                        </Link>
                      </div>
                      <small className="muted">
                        {item.scheduled_at
                          ? DateTime.fromISO(item.scheduled_at)
                              .setZone(timezone)
                              .setLocale(locale)
                              .toLocaleString(DateTime.DATETIME_MED)
                          : '—'}
                      </small>
                  <StatusBadge status={item.status} />
                    </div>
                  );
                })
              ) : (
                <Empty title={t('emptySchedule')} />
              )}
            </Card>
          ) : (
            <Card className="cal-card-wrapper">
              <div className="cal-grid-container">
                {/* Day of Week Headers */}
                <div className="cal-weekdays-row">
                  {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((dayName, idx) => (
                    <div key={idx} className="cal-weekday-header">
                      {dayName}
                    </div>
                  ))}
                </div>

                {/* Day Cells */}
                <div className="cal-days-matrix">
                  {Array.from({ length: days }, (_, i) => {
                    const day = gridStart.plus({ days: i });
                    const isOutside = day.month !== selected.month;
                    const isToday = day.hasSame(DateTime.now().setZone(timezone), 'day');
                    const dayContents = items.filter((c) =>
                      c.scheduled_at
                        ? DateTime.fromISO(c.scheduled_at).setZone(timezone).hasSame(day, 'day')
                        : false,
                    );

                    return (
                      <div
                        key={day.toISO()}
                        className={`cal-matrix-cell ${isOutside ? 'outside' : ''} ${
                          isToday ? 'today' : ''
                        }`}
                      >
                        <div className="cal-cell-header">
                          <span className={`cal-cell-day-num ${isToday ? 'current-day' : ''}`}>
                            {day.day}
                          </span>
                        </div>

                        <div className="cal-cell-items">
                          {dayContents.map((c) => {
                            const ch = c.content_variants?.[0]?.channel || 'instagram';
                            const colors = channelColorPastels[ch] || channelColorPastels.instagram;
                            const timeStr = c.scheduled_at
                              ? DateTime.fromISO(c.scheduled_at).setZone(timezone).toFormat('HH:mm')
                              : '';

                            return (
                              <Link
                                className="cal-content-pill"
                                key={c.id}
                                href={`/contents/${c.id}`}
                                title={`${c.topic} (${ch} • ${timeStr})`}
                                style={{
                                  background: colors.bg,
                                  borderColor: colors.border,
                                }}
                              >
                                <div className="cal-pill-logo">
                                  <SocialLogo channel={ch} size={14} />
                                </div>
                                <div className="cal-pill-content">
                                  {timeStr ? (
                                    <span className="cal-pill-time">{timeStr}</span>
                                  ) : null}
                                  <span className="cal-pill-title">{c.topic}</span>
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Right Sidebar Area: 3 Ordered Blocks */}
        <div className="cal-sidebar-col">
          {/* Block 1: Próximos Conteúdos */}
          <Card className="cal-side-card">
            <div className="cal-side-card-header">
              <h3>{t('upcomingContents')}</h3>
              <Link href="/contents?status=SCHEDULED" className="cal-side-link">
                {t('viewAll')}
              </Link>
            </div>

            <div className="cal-upcoming-list">
              {upcoming.length ? (
                upcoming.map((item) => {
                  const ch = item.content_variants?.[0]?.channel || 'instagram';
                  const schedDate = item.scheduled_at
                    ? DateTime.fromISO(item.scheduled_at).setZone(timezone)
                    : item.created_at
                      ? DateTime.fromISO(item.created_at).setZone(timezone)
                      : null;

                  const isToday = schedDate?.hasSame(DateTime.now().setZone(timezone), 'day');
                  const isTomorrow = schedDate?.hasSame(
                    DateTime.now().setZone(timezone).plus({ days: 1 }),
                    'day',
                  );

                  let timeLabel = '';
                  if (isToday) {
                    timeLabel = `${t('today')} • ${schedDate?.toFormat('HH:mm')}`;
                  } else if (isTomorrow) {
                    timeLabel = `Amanhã • ${schedDate?.toFormat('HH:mm')}`;
                  } else if (schedDate) {
                    timeLabel = schedDate.toFormat('dd MMM • HH:mm');
                  } else {
                    timeLabel = '—';
                  }

                  return (
                    <div key={item.id} className="cal-upcoming-item">
                      <div className="cal-upcoming-logo">
                        <SocialLogo channel={ch} size={28} />
                      </div>
                      <div className="cal-upcoming-text">
                        <span className="cal-upcoming-time">{timeLabel}</span>
                        <Link href={`/contents/${item.id}`} className="cal-upcoming-title">
                          {item.topic}
                        </Link>
                      </div>
                      <div className="cal-upcoming-badge">
                        <StatusBadge status={item.status} />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ padding: '16px 0', textAlign: 'center' }}>
                  <p className="muted" style={{ fontSize: '0.85rem' }}>
                    {t('emptySchedule')}
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* Block 2: Resumo do Mês */}
          <Card className="cal-side-card">
            <div className="cal-side-card-header">
              <h3>{t('monthSummary')}</h3>
            </div>

            <div className="cal-summary-grid">
              {/* Publicados */}
              <div className="cal-summary-box">
                <div
                  className="cal-summary-icon"
                  style={{ background: '#ecfdf5', color: '#10b981' }}
                >
                  <CheckCircle2 size={20} />
                </div>
                <div className="cal-summary-data">
                  <strong>{summary.published}</strong>
                  <span>Publicados</span>
                </div>
              </div>

              {/* Agendados */}
              <div className="cal-summary-box">
                <div
                  className="cal-summary-icon"
                  style={{ background: '#eff6ff', color: '#2563eb' }}
                >
                  <CalendarDays size={20} />
                </div>
                <div className="cal-summary-data">
                  <strong>{summary.scheduled}</strong>
                  <span>Agendados</span>
                </div>
              </div>

              {/* Aprovados */}
              <div className="cal-summary-box">
                <div
                  className="cal-summary-icon"
                  style={{ background: '#f0fdf4', color: '#16a34a' }}
                >
                  <ThumbsUp size={20} />
                </div>
                <div className="cal-summary-data">
                  <strong>{summary.approved}</strong>
                  <span>Aprovados</span>
                </div>
              </div>

              {/* Em revisão */}
              <div className="cal-summary-box">
                <div
                  className="cal-summary-icon"
                  style={{ background: '#fffbeb', color: '#d97706' }}
                >
                  <Clock size={20} />
                </div>
                <div className="cal-summary-data">
                  <strong>{summary.review}</strong>
                  <span>Em revisão</span>
                </div>
              </div>

              {/* Rascunhos */}
              <div className="cal-summary-box">
                <div
                  className="cal-summary-icon"
                  style={{ background: '#f5f3ff', color: '#8b5cf6' }}
                >
                  <FileText size={20} />
                </div>
                <div className="cal-summary-data">
                  <strong>{summary.draft}</strong>
                  <span>Rascunhos</span>
                </div>
              </div>

              {/* Reprovados */}
              <div className="cal-summary-box">
                <div
                  className="cal-summary-icon"
                  style={{ background: '#fef2f2', color: '#ef4444' }}
                >
                  <XCircle size={20} />
                </div>
                <div className="cal-summary-data">
                  <strong>{summary.rejected}</strong>
                  <span>Reprovados</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Block 3: Distribuição por Rede */}
          <Card className="cal-side-card">
            <div className="cal-side-card-header">
              <h3>{t('networkDistribution')}</h3>
            </div>

            <div className="cal-dist-list">
              {channelList.map((ch) => {
                const count = distribution[ch] || 0;
                const info = channels[ch];
                const percentage = Math.round((count / maxDistributionCount) * 100);

                return (
                  <div key={ch} className="cal-dist-row">
                    <div className="cal-dist-channel">
                      <SocialLogo channel={ch} size={20} />
                      <span>{info?.name || ch}</span>
                    </div>
                    <div className="cal-dist-bar-track">
                      <div
                        className="cal-dist-bar-fill"
                        style={{
                          width: `${Math.max(percentage, 6)}%`,
                          background: info?.color || '#3b82f6',
                        }}
                      />
                    </div>
                    <span className="cal-dist-count">{count}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
