'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { CalendarDays, Plus, List, LayoutGrid } from 'lucide-react';
import {
  Button,
  Card,
  Empty,
  Field,
  Modal,
  Notice,
  StatusBadge,
  useT,
  useLocale,
  useAction,
  api,
} from '@/components/ui';
import { channels, statuses, type Agent, type Content, type Channel } from '@/lib/domain';
import { GenerationQueue } from './queue';

function ViewToggle({
  mode,
  onChange,
}: {
  mode: 'list' | 'thumbnails';
  onChange: (m: 'list' | 'thumbnails') => void;
}) {
  const t = useT();
  return (
    <div className="view-toggle">
      <button
        className={mode === 'list' ? 'active' : ''}
        onClick={() => onChange('list')}
        title={t('viewList')}
      >
        <List size={16} />
      </button>
      <button
        className={mode === 'thumbnails' ? 'active' : ''}
        onClick={() => onChange('thumbnails')}
        title={t('viewThumbnails')}
      >
        <LayoutGrid size={16} />
      </button>
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
    locale = useLocale(),
    router = useRouter(),
    params = useSearchParams(),
    action = useAction(),
    [createOpen, setCreateOpen] = useState(params.get('new') === '1'),
    [selected, setSelected] = useState(agents[0]?.id || ''),
    [selectedChannels, setChannels] = useState<Channel[]>(agents[0]?.channels || ['instagram']),
    [network, setNetwork] = useState('');
  const [revision, setRevision] = useState(0);
  const [viewMode, setViewMode] = useState<'list' | 'thumbnails'>('thumbnails');

  useEffect(() => {
    const saved = localStorage.getItem('genios-content-view');
    if (saved === 'list' || saved === 'thumbnails') setViewMode(saved);
  }, []);

  function changeView(m: 'list' | 'thumbnails') {
    setViewMode(m);
    localStorage.setItem('genios-content-view', m);
  }

  function filter(key: string, value: string) {
    const p = new URLSearchParams(params);
    p.delete('page');
    if (value) {
      p.set(key, value);
    } else {
      p.delete(key);
    }
    router.push(`/contents?${p}`);
  }
  return (
    <>
      <div className="page-heading">
        <h1>{t('contents')}</h1>
        <p>{t('contentsIntro')}</p>
      </div>
      <div className="toolbar">
        <select
          aria-label={t('all')}
          value={params.get('status') || ''}
          onChange={(e) => filter('status', e.target.value)}
        >
          <option value="">{t('all')}</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {t(s)}
            </option>
          ))}
        </select>
        <select
          aria-label={t('allAgents')}
          value={params.get('agent') || ''}
          onChange={(e) => filter('agent', e.target.value)}
        >
          <option value="">{t('allAgents')}</option>
          {agents.map((a) => (
            <option value={a.id} key={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          aria-label={t('allChannels')}
          value={network}
          onChange={(e) => setNetwork(e.target.value)}
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
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            {t('newContent')}
          </Button>
        ) : null}
      </div>
      <GenerationQueue
        status={params.get('status') || ''}
        agent={params.get('agent') || ''}
        network={network}
        canEdit={canEdit}
        revision={revision}
      />
      {items.length ? (
        viewMode === 'list' ? (
          <Card>
            <div className="content-list-view">
              {items.map((item) => {
                const variant = item.content_variants.find(
                  (v) => !network || v.channel === network,
                );
                if (network && !variant) return null;
                const promptText =
                  item.content_variants.find((v) => v.image_prompts?.length)?.image_prompts?.[0] ||
                  item.content_variants.find((v) => v.visual_concept)?.visual_concept ||
                  (item.strategy as Record<string, string>)?.hook ||
                  (item.strategy as Record<string, string>)?.core_message ||
                  item.topic;
                return (
                  <Link
                    key={item.id}
                    href={`/contents/${item.id}`}
                    className="content-list-row"
                  >
                    <div className="content-list-title">
                      <h3>{item.topic || t('GENERATING')}</h3>
                    </div>
                    <div className="content-list-prompt">
                      <span className="prompt-label">{t('prompt')}</span>
                      <span className="prompt-text" title={promptText}>
                        {promptText}
                      </span>
                    </div>
                    <div className="content-list-meta">
                      <small>
                        {new Date(item.scheduled_at || item.created_at).toLocaleDateString(locale)}
                      </small>
                      <StatusBadge status={item.status} />
                    </div>
                  </Link>
                );
              })}
            </div>
          </Card>
        ) : (
          <div className="content-thumbs-view">
            {items.map((item) => {
              const filteredVariants = item.content_variants.filter(
                (v) => !network || v.channel === network,
              );
              if (network && filteredVariants.length === 0) return null;
              return (
                <div key={item.id} className="content-thumbs-row">
                  <div className="content-thumbs-images">
                    {filteredVariants.map((variant) => {
                      const media = variant.content_media?.[0];
                      const ch = channels[variant.channel];
                      return (
                        <Link
                          key={variant.id}
                          href={`/contents/${item.id}?channel=${variant.channel}`}
                          className="thumb-item"
                          title={`${ch?.name || variant.channel} - ${item.topic}`}
                        >
                          {media?.url ? (
                            <img
                              loading="lazy"
                              src={media.url}
                              alt={`${ch?.name || variant.channel}`}
                              style={{
                                aspectRatio: variant.aspect_ratio.replace(':', '/'),
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 110,
                                aspectRatio: variant.aspect_ratio.replace(':', '/') || '4/5',
                                display: 'grid',
                                placeItems: 'center',
                                background: 'var(--canvas)',
                                borderRadius: 8,
                              }}
                            >
                              <CalendarDays color="#aab5d5" size={24} />
                            </div>
                          )}
                          <span
                            className="thumb-label"
                            style={{ color: ch?.color ? 'white' : undefined }}
                          >
                            {ch?.name || variant.channel}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                  <div className="content-thumbs-info">
                    <Link href={`/contents/${item.id}`} className="content-thumbs-title-link">
                      <h3>{item.topic || t('GENERATING')}</h3>
                    </Link>
                    <small>
                      {new Date(item.scheduled_at || item.created_at).toLocaleString(locale)}
                    </small>
                    <StatusBadge status={item.status} />
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : params.get('status') === 'GENERATING' || params.get('status') === 'FAILED' ? null : (
        <Card>
          <Empty title={t('emptyContent')}>
            <Link className="button secondary" href="/agents">
              {t('configureGenie')}
            </Link>
          </Empty>
        </Card>
      )}
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
        <Modal title={t('newContent')} onClose={() => setCreateOpen(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              void action.act(async () => {
                await api('runs', 'POST', {
                  agent_id: selected,
                  instruction: String(data.get('instruction') || ''),
                  channels: selectedChannels,
                  image_count: Number(data.get('image_count')),
                  idempotency_key: crypto.randomUUID(),
                });
                setRevision((v) => v + 1);
                setCreateOpen(false);
                router.push('/contents?status=GENERATING');
                router.refresh();
              }, 'enqueued');
            }}
          >
            <Field label={t('agents')}>
              <select
                value={selected}
                required
                onChange={(e) => {
                  setSelected(e.target.value);
                  setChannels(agents.find((a) => a.id === e.target.value)?.channels || []);
                }}
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('topic')}>
              <textarea name="instruction" maxLength={10000} />
            </Field>
            <div className="grid two">
              {Object.entries(channels).map(([key, c]) => (
                <label key={key} className="check">
                  <input
                    type="checkbox"
                    checked={selectedChannels.includes(key as Channel)}
                    onChange={(e) =>
                      setChannels(
                        e.target.checked
                          ? [...selectedChannels, key as Channel]
                          : selectedChannels.filter((v) => v !== key),
                      )
                    }
                  />
                  {c.name} · {c.ratio}
                </label>
              ))}
            </div>
            <Field label={t('imageCount')}>
              <input type="number" name="image_count" min={0} max={20} defaultValue={1} />
            </Field>
            <Notice {...action} />
            <Button
              disabled={!selected || selectedChannels.length === 0}
              busy={action.busy}
              type="submit"
            >
              {t('create')}
            </Button>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
