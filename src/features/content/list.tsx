'use client';
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
import { channels, statuses, type Agent, type Content, type Channel } from '@/lib/domain';
import { useGenerationRuns, RunCard } from './queue';
import { ContentExecutionCard } from './cards';
import { AgentFilter } from '@/components/agent-filter';
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
                      {s === 'GENERATING'
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
}: {
  items: Content[];
  total: number;
  page: number;
  agents: Agent[];
  canEdit: boolean;
}) {
  const t = useT(),
    router = useRouter(),
    params = useSearchParams(),
    action = useAction(),
    [createOpen, setCreateOpen] = useState(params.get('new') === '1'),
    [selected, setSelected] = useState(params.get('agent') || agents[0]?.id || ''),
    [selectedChannels, setChannels] = useState<Channel[]>(
      (agents.find((a) => a.id === params.get('agent')) || agents[0])?.channels?.length
        ? (agents.find((a) => a.id === params.get('agent')) || agents[0])!.channels
        : ALL_CHANNELS,
    ),
    [imageStyle, setImageStyle] = useState('Disney / Pixar'),
    [instruction, setInstruction] = useState(''),
    [imageCount, setImageCount] = useState(2),
    [isCarousel, setIsCarousel] = useState(true),
    [cta, setCta] = useState(''),
    [savingDraft, setSavingDraft] = useState(false),
    [pautaMagicUsed, setPautaMagicUsed] = useState(false),
    [pautaBusy, setPautaBusy] = useState(false),
    [ctaMagicUsed, setCtaMagicUsed] = useState(false),
    [ctaBusy, setCtaBusy] = useState(false),
    [magicError, setMagicError] = useState('');

  function openCreateModal() {
    const agent = agents.find((a) => a.id === params.get('agent'));
    if (agent) {
      setSelected(agent.id);
      if (agent.channels?.length) setChannels(agent.channels);
    }
    setPautaMagicUsed(false);
    setCtaMagicUsed(false);
    setPautaBusy(false);
    setCtaBusy(false);
    setMagicError('');
    setSavingDraft(false);
    setCreateOpen(true);
  }

  async function handleMagicPauta() {
    if (!instruction.trim() || pautaMagicUsed || pautaBusy) return;
    setPautaBusy(true);
    setMagicError('');
    try {
      const res = await api('ai/magic-prompt', 'POST', {
        text: instruction.trim(),
        type: 'instruction',
        agent_id: selected,
      });
      if (res?.refinedText) {
        setInstruction(res.refinedText);
        setPautaMagicUsed(true);
      }
    } catch (e) {
      setMagicError(e instanceof Error ? e.message : 'Falha ao executar Prompt Mágico');
    } finally {
      setPautaBusy(false);
    }
  }

  async function handleMagicCta() {
    if (!cta.trim() || ctaMagicUsed || ctaBusy) return;
    setCtaBusy(true);
    setMagicError('');
    try {
      const res = await api('ai/magic-prompt', 'POST', {
        text: cta.trim(),
        type: 'cta',
        agent_id: selected,
      });
      if (res?.refinedText) {
        setCta(res.refinedText);
        setCtaMagicUsed(true);
      }
    } catch (e) {
      setMagicError(e instanceof Error ? e.message : 'Falha ao executar Prompt Mágico');
    } finally {
      setCtaBusy(false);
    }
  }

  async function handleSaveDraft() {
    if (savingDraft || action.busy || !selected || selectedChannels.length === 0) return;
    setSavingDraft(true);
    setMagicError('');
    try {
      await api('content', 'POST', {
        agent_id: selected,
        instruction: instruction.trim(),
        image_style: imageStyle,
        is_carousel: isCarousel,
        cta: cta.trim(),
        channels: selectedChannels,
        image_count: Number(imageCount),
        status: 'DRAFT',
      });
      setRevision((v) => v + 1);
      setCreateOpen(false);
      router.push(`/contents?status=DRAFT&agent=${selected}`);
      router.refresh();
    } catch (e) {
      setMagicError(e instanceof Error ? e.message : 'Falha ao salvar rascunho');
    } finally {
      setSavingDraft(false);
    }
  }
  const network = params.get('network') || '';
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
      (!network || !r.channels.length || r.channels.includes(network)) &&
      (!params.get('status') ||
        params
          .get('status')!
          .split(',')
          .includes(r.status === 'FAILED' ? 'FAILED' : 'GENERATING')),
  );
  const displayItems = items.filter(
    (i) =>
      !visibleRuns.some((r) => (r.contentId || r.id) === i.id) &&
      (!network || i.content_variants.some((v) => v.channel === network)),
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
        <select
          aria-label={t('allChannels')}
          value={network}
          onChange={(e) => filter('network', e.target.value)}
        >
          <option value="">{t('allChannels')}</option>
          {Object.entries(channels).map(([key, c]) => (
            <option value={key} key={key}>
              {c.name}
            </option>
          ))}
        </select>
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
      {createOpen ? (
        <Modal
          title="Novo conteúdo"
          subtitle="Configure os detalhes para gerar seu conteúdo."
          icon={<Sparkles size={20} className="modal-sparkle-icon" />}
          className="modal-new-content"
          onClose={() => setCreateOpen(false)}
        >
          <form
            className="new-content-form"
            onSubmit={(e) => {
              e.preventDefault();
              void action.act(async () => {
                await api('runs', 'POST', {
                  agent_id: selected,
                  instruction: instruction.trim(),
                  image_style: imageStyle,
                  is_carousel: isCarousel,
                  cta: cta.trim(),
                  channels: selectedChannels,
                  image_count: Number(imageCount),
                  idempotency_key: crypto.randomUUID(),
                });
                setRevision((v) => v + 1);
                setCreateOpen(false);
                router.push(`/contents?status=GENERATING&agent=${selected}`);
                router.refresh();
              }, 'enqueued');
            }}
          >
            <div className="new-content-field">
              <label className="new-content-label">Agentes</label>
              <div className="new-content-input-wrapper">
                <Users size={18} className="field-prefix-icon" />
                <select
                  value={selected}
                  required
                  onChange={(e) => {
                    setSelected(e.target.value);
                    const agent = agents.find((a) => a.id === e.target.value);
                    if (agent?.channels?.length) setChannels(agent.channels);
                  }}
                >
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="new-content-field">
              <label className="new-content-label">Estilo da Imagem *</label>
              <div className="new-content-input-wrapper">
                <Palette size={18} className="field-prefix-icon" />
                <select
                  value={imageStyle}
                  required
                  onChange={(e) => setImageStyle(e.target.value)}
                >
                  <option value="Disney / Pixar">Disney / Pixar</option>
                  <option value="3D Cartoon Moderno">3D Cartoon Moderno</option>
                  <option value="Fotorealista / Ultra-realista">Fotorealista / Ultra-realista</option>
                  <option value="Minimalista / Editorial">Minimalista / Editorial</option>
                  <option value="Ilustração Digital / Vetorial">Ilustração Digital / Vetorial</option>
                  <option value="Cyberpunk / Futurista">Cyberpunk / Futurista</option>
                  <option value="Anime / Mangá Japonês">Anime / Mangá Japonês</option>
                  <option value="Vintage / Retrô Clássico">Vintage / Retrô Clássico</option>
                  <option value="Pintura a Óleo / Belas Artes">Pintura a Óleo / Belas Artes</option>
                  <option value="Flat Design Corporativo">Flat Design Corporativo</option>
                </select>
              </div>
            </div>

            <div className="new-content-field">
              <div className="field-label-with-action">
                <label className="new-content-label">Pauta / instrução opcional</label>
                {pautaMagicUsed ? (
                  <span className="magic-prompt-badge-used">✓ Prompt Mágico utilizado</span>
                ) : (
                  <button
                    type="button"
                    className="magic-prompt-btn"
                    disabled={!instruction.trim() || pautaBusy}
                    onClick={handleMagicPauta}
                    title={
                      !instruction.trim()
                        ? 'Escreva algo na pauta para habilitar o Prompt Mágico'
                        : 'Melhorar e organizar com IA'
                    }
                  >
                    <Sparkles size={13} className={pautaBusy ? 'spin-icon' : ''} />
                    <span>{pautaBusy ? 'Melhorando...' : 'Prompt Mágico'}</span>
                  </button>
                )}
              </div>
              <div className="new-content-textarea-wrapper">
                <FileText size={18} className="textarea-prefix-icon" />
                <textarea
                  name="instruction"
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="Descreva a ideia, tema ou instruções para as imagens..."
                  maxLength={10000}
                  rows={3}
                />
              </div>
            </div>

            <div className="new-content-field">
              <div className="channel-section-header">
                <label className="new-content-label">Canais de publicação</label>
                <p className="new-content-sublabel">
                  Escolha em quais redes sociais gerar as imagens e o formato ideal para cada uma.
                </p>
              </div>
              <div className="new-content-channels-grid">
                {ALL_CHANNELS.map((ch) => {
                  const isChecked = selectedChannels.includes(ch);
                  return (
                    <div
                      key={ch}
                      className={`new-content-channel-card ${isChecked ? 'selected' : ''}`}
                      role="checkbox"
                      aria-checked={isChecked}
                      tabIndex={0}
                      onClick={() =>
                        setChannels((prev) =>
                          prev.includes(ch) ? prev.filter((v) => v !== ch) : [...prev, ch],
                        )
                      }
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault();
                          setChannels((prev) =>
                            prev.includes(ch) ? prev.filter((v) => v !== ch) : [...prev, ch],
                          );
                        }
                      }}
                    >
                      <div className="channel-card-logo">
                        <SocialLogo channel={ch} size={32} />
                      </div>
                      <div className="channel-card-info">
                        <strong className="channel-card-name">{channels[ch].name}</strong>
                        <span className="channel-card-ratio">{channels[ch].ratio}</span>
                      </div>
                      <div className={`channel-card-checkbox ${isChecked ? 'checked' : ''}`}>
                        {isChecked && <Check size={14} strokeWidth={3} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="new-content-field">
              <label className="new-content-label">Imagens por canal</label>
              <div className="image-count-stepper-row">
                <div className="image-count-stepper">
                  <button
                    type="button"
                    className="stepper-btn"
                    disabled={imageCount <= 1}
                    onClick={() => setImageCount((prev) => Math.max(1, prev - 1))}
                    aria-label="Diminuir imagens"
                  >
                    <Minus size={16} />
                  </button>
                  <span className="stepper-value">{imageCount}</span>
                  <button
                    type="button"
                    className="stepper-btn"
                    disabled={imageCount >= 6}
                    onClick={() => setImageCount((prev) => Math.min(6, prev + 1))}
                    aria-label="Aumentar imagens"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <div className="total-consumption-badge">
                  <span>
                    o total de conteúdos consumidos será <strong>{imageCount * selectedChannels.length}</strong>
                  </span>
                </div>
              </div>
            </div>

            <div className="new-content-carousel-row">
              <div className="carousel-toggle-label">
                <Layers size={18} className="carousel-icon" />
                <span>É carrossel?</span>
              </div>
              <div className="carousel-segmented-control">
                <button
                  type="button"
                  className={`carousel-pill ${isCarousel ? 'active' : ''}`}
                  onClick={() => setIsCarousel(true)}
                >
                  Sim
                </button>
                <button
                  type="button"
                  className={`carousel-pill ${!isCarousel ? 'active' : ''}`}
                  onClick={() => setIsCarousel(false)}
                >
                  Não
                </button>
              </div>
            </div>

            <div className="new-content-field">
              <div className="field-label-with-action">
                <label className="new-content-label">CTA</label>
                {ctaMagicUsed ? (
                  <span className="magic-prompt-badge-used">✓ Prompt Mágico utilizado</span>
                ) : (
                  <button
                    type="button"
                    className="magic-prompt-btn"
                    disabled={!cta.trim() || ctaBusy}
                    onClick={handleMagicCta}
                    title={
                      !cta.trim()
                        ? 'Escreva uma chamada para ação para habilitar o Prompt Mágico'
                        : 'Melhorar CTA com IA'
                    }
                  >
                    <Sparkles size={13} className={ctaBusy ? 'spin-icon' : ''} />
                    <span>{ctaBusy ? 'Melhorando...' : 'Prompt Mágico'}</span>
                  </button>
                )}
              </div>
              <div className="new-content-input-wrapper">
                <MousePointerClick size={18} className="field-prefix-icon" />
                <input
                  type="text"
                  value={cta}
                  onChange={(e) => setCta(e.target.value)}
                  placeholder="Ex.: Saiba mais, Garanta o seu, Acesse agora..."
                  maxLength={500}
                />
              </div>
            </div>

            {magicError && <Notice message={magicError} error />}
            <Notice {...action} />

            <div className="new-content-modal-footer">
              <button
                type="button"
                className="btn-save-draft"
                disabled={action.busy || savingDraft || !selected || selectedChannels.length === 0}
                onClick={handleSaveDraft}
              >
                <FileText size={16} />
                <span>{savingDraft ? 'Salvando...' : 'Salvar como rascunho'}</span>
              </button>
              <div className="modal-footer-right">
                <Button secondary type="button" onClick={() => setCreateOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  className="btn-generate-gradient"
                  disabled={!selected || selectedChannels.length === 0 || savingDraft}
                  busy={action.busy}
                  type="submit"
                >
                  <Sparkles size={16} />
                  <span>Gerar agora</span>
                </Button>
              </div>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
