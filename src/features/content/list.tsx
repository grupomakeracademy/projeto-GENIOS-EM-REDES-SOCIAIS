'use client';
import { NetworkFilter } from '@/components/network-filter';
import { parseNetworks } from '@/lib/network-filter';
import './content.css';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef, useCallback, useSyncExternalStore, useTransition } from 'react';
import {
  Plus,
  Minus,
  List,
  LayoutGrid,
  Columns3,
  Sparkles,
  Users,
  Palette,
  FileText,
  Check,
  Layers,
  MousePointerClick,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  Button,
  Empty,
  Field,
  Modal,
  Notice,
  StatusBadge,
  useT,
  useAction,
  api,
} from '@/components/ui';
import { SocialLogo } from '@/components/social-logos';
import { channels, statuses, type Agent, type Content, type Channel, QUALITY_MULTIPLIERS } from '@/lib/domain';
import { useGenerationRuns, RunCard } from './queue';
import { ContentExecutionCard } from './cards';
import { AgentFilter } from '@/components/agent-filter';
import { ContentFormModal } from './modal';
const ALL_CHANNELS: Channel[] = ['instagram', 'facebook', 'whatsapp', 'tiktok', 'x', 'linkedin'];
const subscribeView = (callback: () => void) => {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
};

function ViewToggle({
  mode,
  onChange,
}: {
  mode: 'list' | 'thumbnails' | 'kanban';
  onChange: (m: 'list' | 'thumbnails' | 'kanban') => void;
}) {
  const t = useT();
  return (
    <div className="view-toggle">
      <button
        aria-pressed={mode === 'list'}
        aria-label={t('viewList')}
        className={mode === 'list' ? 'active' : ''}
        onClick={() => onChange('list')}
        title={t('viewList')}
      >
        <List size={16} />
        <span>{t('viewList')}</span>
      </button>
      <button
        aria-pressed={mode === 'thumbnails'}
        aria-label={t('viewThumbnails')}
        className={mode === 'thumbnails' ? 'active' : ''}
        onClick={() => onChange('thumbnails')}
        title={t('viewThumbnails')}
      >
        <LayoutGrid size={16} />
        <span>{t('viewThumbnails')}</span>
      </button>
      <button
        aria-pressed={mode === 'kanban'}
        className={mode === 'kanban' ? 'active' : ''}
        onClick={() => onChange('kanban')}
        title="Kanban"
        aria-label="Kanban"
      >
        <Columns3 size={16} />
        <span>Kanban</span>
      </button>
    </div>
  );
}

function KanbanBoard({
  statuses,
  displayItems,
  visibleRuns,
  canEdit,
  params,
  renderRun,
}: {
  statuses: readonly string[];
  displayItems: Content[];
  visibleRuns: any[];
  canEdit: boolean;
  params: ReturnType<typeof useSearchParams>;
  renderRun: (run: any) => React.ReactNode;
}) {
  const kanbanRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const hasDraggedRef = useRef(false);

  const checkScroll = useCallback(() => {
    const el = kanbanRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 6);
    setCanScrollRight(max - el.scrollLeft > 6);
    setScrollProgress(max > 0 ? (el.scrollLeft / max) * 100 : 0);
  }, []);

  useEffect(() => {
    const el = kanbanRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [checkScroll]);

  const scrollSide = (direction: 'left' | 'right') => {
    const el = kanbanRef.current;
    if (!el) return;
    const offset = direction === 'left' ? -340 : 340;
    el.scrollBy({ left: offset, behavior: 'smooth' });
  };

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (
      target.closest(
        'button, a, input, textarea, select, .execution-menu, .modal, [role="button"]',
      )
    ) {
      return;
    }
    const el = kanbanRef.current;
    if (!el) return;
    setIsDragging(true);
    hasDraggedRef.current = false;
    startXRef.current = e.pageX - el.offsetLeft;
    scrollLeftRef.current = el.scrollLeft;
  };

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !kanbanRef.current) return;
    e.preventDefault();
    const x = e.pageX - kanbanRef.current.offsetLeft;
    const walk = x - startXRef.current;
    if (Math.abs(walk) > 4) {
      hasDraggedRef.current = true;
    }
    kanbanRef.current.scrollLeft = scrollLeftRef.current - walk;
  };

  const onMouseUp = () => {
    setIsDragging(false);
  };

  const onClickCapture = (e: React.MouseEvent) => {
    if (hasDraggedRef.current) {
      e.stopPropagation();
      e.preventDefault();
      hasDraggedRef.current = false;
    }
  };

  const onTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = kanbanRef.current;
    if (!el) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const max = el.scrollWidth - el.clientWidth;
    el.scrollTo({ left: clickRatio * max, behavior: 'smooth' });
  };

  return (
    <div className="kanban-wrapper">
      {/* Floating Side Buttons */}
      <button
        type="button"
        className={`kanban-floating-arrow kanban-floating-left ${canScrollLeft ? 'visible' : ''}`}
        onClick={() => scrollSide('left')}
        aria-label="Rolar para a esquerda"
      >
        <ChevronLeft size={22} />
      </button>
      <button
        type="button"
        className={`kanban-floating-arrow kanban-floating-right ${canScrollRight ? 'visible' : ''}`}
        onClick={() => scrollSide('right')}
        aria-label="Rolar para a direita"
      >
        <ChevronRight size={22} />
      </button>

      {/* Main Kanban Board Container */}
      <div
        ref={kanbanRef}
        className={`content-kanban ${isDragging ? 'is-dragging' : ''}`}
        aria-label="Kanban de conteúdos"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onClickCapture={onClickCapture}
      >
        {statuses
          .filter((s) => !params.get('status') || params.get('status')!.split(',').includes(s))
          .map((s) => {
            const group = displayItems.filter((i) => i.status === s);
            const pending = visibleRuns.filter(
              (r) => (r.status === 'FAILED' ? 'FAILED' : 'GENERATING') === s,
            );
            return (
              <section className={`kanban-column kanban-column-${s}`} key={s}>
                <header>
                  <StatusBadge status={s} />
                  <span className="kanban-counter">{group.length + pending.length}</span>
                </header>
                {pending.map(renderRun)}
                {group.map((item) => (
                  <ContentExecutionCard
                    key={item.id}
                    item={item}
                    mode="kanban"
                    canEdit={canEdit}
                    returnTo={'/contents?' + params}
                  />
                ))}
                {!group.length && !pending.length && (
                  <div className="kanban-empty-card">
                    <FileText size={22} className="kanban-empty-icon" />
                    <strong>Nenhum conteúdo nesta página</strong>
                    <span>
                      {s === 'ROUTINE'
                        ? 'Os conteúdos gerados por rotina aguardando aprovação aparecerão aqui.'
                        : s === 'GENERATING'
                          ? 'Os conteúdos que estiverem sendo gerados aparecerão aqui.'
                          : s === 'AWAITING_REVIEW'
                            ? 'Os conteúdos aguardando revisão aparecerão aqui.'
                            : s === 'SCHEDULED'
                              ? 'Os conteúdos agendados aparecerão aqui.'
                              : 'Nenhum conteúdo neste status no momento.'}
                    </span>
                  </div>
                )}
              </section>
            );
          })}
      </div>

      {/* Sticky Bottom Scrollbar — Always accessible anywhere on page */}
      <div className="kanban-sticky-bar">
        <button
          type="button"
          className="kanban-sticky-nav-btn"
          disabled={!canScrollLeft}
          onClick={() => scrollSide('left')}
          title="Colunas anteriores"
          aria-label="Colunas anteriores"
        >
          <ChevronLeft size={16} />
        </button>

        <div
          className="kanban-sticky-track"
          onClick={onTrackClick}
          title="Barra de rolagem horizontal rápida"
        >
          <div
            className="kanban-sticky-thumb"
            style={{
              left: `${Math.min(Math.max(scrollProgress, 0), 88)}%`,
              width: kanbanRef.current
                ? `${Math.max((kanbanRef.current.clientWidth / kanbanRef.current.scrollWidth) * 100, 12)}%`
                : '16%',
            }}
          />
        </div>

        <button
          type="button"
          className="kanban-sticky-nav-btn"
          disabled={!canScrollRight}
          onClick={() => scrollSide('right')}
          title="Próximas colunas"
          aria-label="Próximas colunas"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

export function ContentList({
  items,
  total,
  page,
  agents,
  canEdit,
  availableNetworks,
  defaultImageQuality = 'low',
}: {
  items: Content[];
  total: number;
  page: number;
  agents: Agent[];
  canEdit: boolean;
  availableNetworks: Channel[];
  defaultImageQuality?: 'low' | 'medium';
}) {
  const t = useT(),
    router = useRouter(),
    params = useSearchParams(),
    action = useAction(),
    [createOpen, setCreateOpen] = useState(params.get('new') === '1');

  function openCreateModal() {
    setCreateOpen(true);
  }
  const network = parseNetworks(params.get('network'));
  const [revision, setRevision] = useState(0);
  const [filterPending, startFilterTransition] = useTransition();
  const savedView = useSyncExternalStore(
    subscribeView,
    () => localStorage.getItem('genios-content-view'),
    () => 'thumbnails',
  );
  const chosenView = params.get('view') || savedView;
  const viewMode = chosenView === 'list' || chosenView === 'kanban' ? chosenView : 'thumbnails';

  const queue = useGenerationRuns(revision, params.get('agent')||'');
  const visibleRuns = queue.runs.filter(
    (r) =>
      (!params.get('from') || Date.parse(r.scheduledAt) >= Date.parse(params.get('from')!)) &&
      (!params.get('to') || Date.parse(r.scheduledAt) < Date.parse(params.get('to')!)) &&
      (!params.get('agent') || r.agentId === params.get('agent')) &&
      (!network.length || r.channels.some(c => network.includes(c as Channel))) &&
      (!params.get('status') ||
        params
          .get('status')!
          .split(',')
          .includes(r.status === 'FAILED' ? 'FAILED' : 'GENERATING')),
  );
  const displayItems = items.filter(
    (i) =>
      !visibleRuns.some((r) => (r.contentId || r.id) === i.id) &&
      (!network.length || i.content_variants.some((v) => network.includes(v.channel))),
  );
  const renderRun = (run: (typeof queue.runs)[number]) => (
    <RunCard
      key={run.id}
      run={run}
      canEdit={canEdit}
      returnTo={'/contents?' + params}
      onChange={() => setRevision((v) => v + 1)}
    />
  );
  useEffect(() => {
    const scroll = sessionStorage.getItem('content-scroll');
    if (scroll) {
      window.scrollTo(0, Number(scroll));
      sessionStorage.removeItem('content-scroll');
    }

    // Restore saved status filter and view mode when user returns from other sessions
    try {
      const savedStatus = localStorage.getItem('genios-content-status');
      const hasStatusInUrl = params.has('status');
      const savedViewMode = localStorage.getItem('genios-content-view');
      const hasViewInUrl = params.has('view');

      let shouldUpdate = false;
      const p = new URLSearchParams(params.toString());

      if (!hasStatusInUrl && savedStatus && savedStatus !== 'ALL') {
        p.set('status', savedStatus);
        shouldUpdate = true;
      }
      if (!hasViewInUrl && savedViewMode && (savedViewMode === 'list' || savedViewMode === 'kanban')) {
        p.set('view', savedViewMode);
        shouldUpdate = true;
      }

      if (shouldUpdate) {
        startFilterTransition(() => router.replace(`/contents?${p.toString()}`, { scroll: false }));
      }
    } catch {}
  }, []);

  function changeView(m: 'list' | 'thumbnails' | 'kanban') {
    localStorage.setItem('genios-content-view', m);
    filter('view', m);
  }

  function filter(key: string, value: string) {
    const p = new URLSearchParams(params);
    p.delete('page');
    if (value) {
      p.set(key, value);
    } else {
      p.delete(key);
    }
    if (key === 'status') {
      try {
        localStorage.setItem('genios-content-status', value || 'ALL');
      } catch {}
    }
    startFilterTransition(() => router.push(`/contents?${p}`, { scroll: false }));
  }
  return (
    <>
      <div className="page-heading">
        <h1>{t('contents')}</h1>
        <p>{t('contentsIntro')}</p>
      </div>
      <fieldset
        disabled={filterPending}
        className="toolbar content-toolbar"
        aria-label="Opções de visualização"
      >
        <AgentFilter agents={agents} value={params.get('agent') || ''} onChange={id => filter('agent',id)}/>
        <NetworkFilter available={availableNetworks} />
        <select
          aria-label={t('sortNewestFirst')}
          value={params.get('sort') || 'desc'}
          onChange={(e) => filter('sort', e.target.value)}
        >
          <option value="desc">{t('sortNewestFirst')}</option>
          <option value="asc">{t('sortOldestFirst')}</option>
        </select>
        <ViewToggle mode={viewMode} onChange={changeView} />
        {canEdit ? (
          <Button onClick={openCreateModal}>
            <Plus size={16} />
            {t('newContent')}
          </Button>
        ) : null}
      </fieldset>
      <fieldset
        disabled={filterPending}
        className="content-status-filters"
        aria-label="Filtrar por status"
      >
        <button
          aria-pressed={!params.get('status')}
          className={!params.get('status') ? 'active' : ''}
          onClick={() => filter('status', '')}
        >
          {t('all')}
        </button>
        {statuses.map((s) => {
          const selected = (params.get('status') || '').split(',').filter(Boolean);
          return (
            <button
              key={s}
              aria-pressed={selected.includes(s)}
              className={selected.includes(s) ? 'active' : ''}
              onClick={() =>
                filter(
                  'status',
                  (selected.includes(s) ? selected.filter((v) => v !== s) : [...selected, s]).join(
                    ',',
                  ),
                )
              }
            >
              {t(s)}
            </button>
          );
        })}
      </fieldset>
      <div className="content-workspace" aria-busy={filterPending}>
        <Notice message={queue.error} error />
        {viewMode !== 'kanban' && visibleRuns.length > 0 && (
          <section className="execution-section">
            <h2>{t('generationQueue')}</h2>
            <div className="execution-queue">{visibleRuns.map(renderRun)}</div>
          </section>
        )}
        {viewMode === 'kanban' ? (
          <KanbanBoard
            statuses={statuses}
            displayItems={displayItems}
            visibleRuns={visibleRuns}
            canEdit={canEdit}
            params={params}
            renderRun={renderRun}
          />
        ) : (
          <div className={'content-collection collection-' + viewMode}>
            {displayItems.map((item) => (
              <ContentExecutionCard
                key={item.id}
                item={item}
                mode={viewMode}
                canEdit={canEdit}
                returnTo={'/contents?' + params}
              />
            ))}
          </div>
        )}
        {!displayItems.length && !visibleRuns.length && viewMode !== 'kanban' && (
          <Empty title={t('emptyContent')} />
        )}
      </div>
      {total > 12 ? (
        <div className="pagination">
          <Button secondary disabled={page === 1} onClick={() => filter('page', String(page - 1))}>
            {t('previous')}
          </Button>
          <span>
            {page} / {Math.ceil(total / 12)}
          </span>
          <Button
            secondary
            disabled={page * 12 >= total}
            onClick={() => filter('page', String(page + 1))}
          >
            {t('following')}
          </Button>
        </div>
      ) : null}
      <ContentFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        agents={agents}
        defaultImageQuality={defaultImageQuality}
        onSaved={() => {
          setRevision((v) => v + 1);
          const p = new URLSearchParams(params.toString());
          p.delete('page');
          router.push(`/contents?${p.toString()}`);
          router.refresh();
        }}
        onGenerated={() => {
          setRevision((v) => v + 1);
          router.refresh();
        }}
      />
    </>
  );
}
