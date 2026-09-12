'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DateTime } from 'luxon';
import {
  Button,
  Card,
  Field,
  Notice,
  StatusBadge,
  Empty,
  useT,
  useLocale,
  useAction,
  api,
} from '@/components/ui';
import { channels, type Content } from '@/lib/domain';
export function ContentDetail({
  initial,
  company,
  timezone,
  canEdit,
  events,
}: {
  initial: Content;
  company: string;
  timezone: string;
  canEdit: boolean;
  events: { id: string; event: string; created_at: string }[];
}) {
  const t = useT(),
    locale = useLocale(),
    router = useRouter(),
    searchParams = useSearchParams(),
    action = useAction(),
    channelParam = searchParams.get('channel'),
    initialIndex = channelParam
      ? Math.max(0, initial.content_variants.findIndex((v) => v.channel === channelParam))
      : 0,
    [item, setItem] = useState(initial),
    [index, setIndex] = useState(initialIndex >= 0 ? initialIndex : 0),
    [caption, setCaption] = useState(
      initial.content_variants[initialIndex >= 0 ? initialIndex : 0]?.caption || '',
    ),
    [position, setPosition] = useState(0),
    [date, setDate] = useState('');
  const variant = item.content_variants[index],
    media = variant?.content_media?.find((m) => m.position === position);
  async function operation(name: string, extra: Record<string, unknown> = {}) {
    await action.act(
      async () => {
        await api(`content/${item.id}`, 'POST', { action: name, version: item.version, ...extra });
        const latest = await api(`content/${item.id}`);
        setItem(latest);
        setCaption(latest.content_variants[index]?.caption || '');
        router.refresh();
      },
      name.startsWith('regenerate') ? 'enqueued' : 'saved',
    );
  }
  return (
    <>
      <div className="page-heading">
        <h1>{item.topic || t('GENERATING')}</h1>
        <StatusBadge status={item.status} />
      </div>
      <div className="tabs">
        {item.content_variants.map((v, i) => (
          <button
            className={i === index ? 'active' : ''}
            key={v.id}
            onClick={() => {
              setIndex(i);
              setCaption(v.caption);
              setPosition(0);
            }}
          >
            {channels[v.channel].name}
          </button>
        ))}
      </div>
      <div className="detail-grid">
        <Card>
          {variant ? (
            <>
              <Field label={t('caption')}>
                <textarea
                  value={caption}
                  maxLength={channels[variant.channel].limit}
                  rows={12}
                  disabled={
                    !canEdit ||
                    ['GENERATING', 'PUBLISHING', 'PUBLISHED', 'ARCHIVED'].includes(item.status)
                  }
                  onChange={(e) => setCaption(e.target.value)}
                />
                <small>
                  {caption.length} / {channels[variant.channel].limit}
                </small>
              </Field>
              <div className="form-row">
                <Button
                  secondary
                  onClick={() =>
                    action.act(async () => {
                      await navigator.clipboard.writeText(caption);
                    }, 'copied')
                  }
                >
                  {t('copy')}
                </Button>
                {canEdit ? (
                  <Button
                    busy={action.busy}
                    disabled={caption === variant.caption}
                    onClick={() => operation('edit', { variant_id: variant.id, caption })}
                  >
                    {t('save')}
                  </Button>
                ) : null}
              </div>
              {canEdit && ['AWAITING_REVIEW', 'REJECTED', 'FAILED'].includes(item.status) ? (
                <Button
                  secondary
                  busy={action.busy}
                  onClick={() =>
                    operation('regenerate_copy', {
                      variant_id: variant.id,
                      idempotency_key: crypto.randomUUID(),
                    })
                  }
                >
                  {t('regenerateCopy')}
                </Button>
              ) : null}
            </>
          ) : (
            <Empty title={t('GENERATING')} />
          )}
          <hr />
          <p className="muted">{t('approvalNote')}</p>
          {canEdit ? (
            <div className="form-row">
              {item.status === 'AWAITING_REVIEW' ? (
                <>
                  <Button busy={action.busy} onClick={() => operation('approve')}>
                    {t('approve')}
                  </Button>
                  <Button secondary busy={action.busy} onClick={() => operation('reject')}>
                    {t('reject')}
                  </Button>
                </>
              ) : null}
              {item.status === 'APPROVED' ? (
                <>
                  <Field label={`${t('schedule')} · ${timezone}`}>
                    <input
                      type="datetime-local"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </Field>
                  <Button
                    busy={action.busy}
                    disabled={!date}
                    onClick={() =>
                      operation('schedule', {
                        scheduled_at: DateTime.fromISO(date, { zone: timezone }).toUTC().toISO(),
                      })
                    }
                  >
                    {t('schedule')}
                  </Button>
                  <p className="muted">{t('manualSchedule')}</p>
                </>
              ) : null}
              {!['GENERATING', 'PUBLISHING', 'ARCHIVED'].includes(item.status) ? (
                <Button secondary busy={action.busy} onClick={() => operation('archive')}>
                  {t('archive')}
                </Button>
              ) : null}
            </div>
          ) : null}
          <Notice {...action} />
          <h2>{t('history')}</h2>
          {events.map((e) => (
            <div className="list-row" key={e.id}>
              <span>{t(e.event)}</span>
              <small>{new Date(e.created_at).toLocaleString(locale)}</small>
            </div>
          ))}
        </Card>
        <Card>
          <h2>{t('preview')}</h2>
          {variant ? (
            <>
              <div
                className={`preview-frame ${['instagram', 'tiktok', 'whatsapp'].includes(variant.channel) ? 'phone' : ''}`}
              >
                <header>
                  <span className="avatar">{company.slice(0, 2).toUpperCase()}</span>
                  <strong>{company}</strong>
                </header>
                {media?.url ? (
                  <img
                    src={media.url}
                    alt={variant.title}
                    style={{ aspectRatio: variant.aspect_ratio.replace(':', '/') }}
                  />
                ) : (
                  <Empty title={t('noImage')} />
                )}
                <p>{caption}</p>
              </div>
              <div className="pagination">
                {variant.content_media?.map((m) => (
                  <button
                    className="icon-button"
                    key={m.id}
                    aria-label={`${m.position + 1}`}
                    onClick={() => setPosition(m.position)}
                  >
                    {m.position + 1}
                  </button>
                ))}
              </div>
              {media?.url ? (
                <a className="button secondary" href={`/api/download?id=${media.id}&type=media`}>
                  {t('download')}
                </a>
              ) : null}
              {canEdit && ['AWAITING_REVIEW', 'REJECTED', 'FAILED'].includes(item.status) ? (
                <Button
                  secondary
                  busy={action.busy}
                  onClick={() =>
                    operation('regenerate_image', {
                      variant_id: variant.id,
                      position,
                      idempotency_key: crypto.randomUUID(),
                    })
                  }
                >
                  {t('regenerateImage')}
                </Button>
              ) : null}
            </>
          ) : null}
        </Card>
      </div>
    </>
  );
}
