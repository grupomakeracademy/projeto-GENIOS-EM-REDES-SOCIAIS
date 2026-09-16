'use client';
import './content.css';
import {CaptionEditor} from '@/features/captions/editor';
import { useState } from 'react';
import Link from 'next/link';
import {
  X,
  ExternalLink,
  Download,
  CheckCircle2,
  AlertCircle,
  Send,
  Calendar,
  Sparkles,
  Layers,
  FileText,
} from 'lucide-react';
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
import { channels, type Content, type Agent } from '@/lib/domain';
import { ContentFormModal } from './modal';
export function ContentDetail({
  initial,
  company,
  timezone,
  canEdit,
  events,
  connections = [],
  agents = [],
  defaultImageQuality = 'low',
}: {
  initial: Content;
  company: string;
  timezone: string;
  canEdit: boolean;
  events: { id: string; event: string; created_at: string }[];
  connections?: { id: string; channel: string; account_name?: string; created_at: string }[];
  agents?: Agent[];
  defaultImageQuality?: 'low' | 'medium';
}) {
  const t = useT(),
    locale = useLocale(),
    router = useRouter(),
    searchParams = useSearchParams(),
    action = useAction(),
    channelParam = searchParams.get('channel'),
    initialIndex = channelParam
      ? Math.max(
          0,
          initial.content_variants.findIndex((v) => v.channel === channelParam),
        )
      : 0,
    [item, setItem] = useState(initial),
    [index, setIndex] = useState(initialIndex >= 0 ? initialIndex : 0),
    [caption, setCaption] = useState(
      initial.content_variants[initialIndex >= 0 ? initialIndex : 0]?.caption || '',
    ),
    [subTab, setSubTab] = useState<'caption' | 'instruction'>(
      initial.status === 'DRAFT' ? 'instruction' : 'caption',
    ),
    [position, setPosition] = useState(0),
    [selectedVersion, setSelectedVersion] = useState<number | null>(null),
    [regenerating, setRegenerating] = useState(false),
    [date, setDate] = useState(''),
    [reviewModalOpen, setReviewModalOpen] = useState(false),
    [generatingDraft, setGeneratingDraft] = useState(false);
  const isDraft = item.status === 'DRAFT';
  const variant = item.content_variants[index];

  // All media items for this variant and position, sorted chronologically / by version
  const positionMedias = (variant?.content_media || [])
    .filter((m) => m.position === position)
    .sort((a, b) => (a.version ?? 1) - (b.version ?? 1));

  // Default to the explicitly selected version, or the latest version available
  const activeMedia =
    selectedVersion !== null
      ? positionMedias.find((m) => (m.version ?? 1) === selectedVersion) ||
        positionMedias[positionMedias.length - 1]
      : positionMedias[positionMedias.length - 1];
  const media = activeMedia;

  const connection = connections.find((c) => c.channel === variant?.channel);
  const isConnected = !!connection;
  const [previewOpen, setPreviewOpen] = useState(false);
  const requestedReturn = searchParams.get('returnTo') || '';
  const returnTo =
    requestedReturn === '/contents' || requestedReturn.startsWith('/contents?')
      ? requestedReturn
      : '/contents';

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

  async function handleDirectGenerateDraft() {
    if (generatingDraft || action.busy) return;
    setGeneratingDraft(true);
    try {
      await action.act(async () => {
        const strategy = (item.strategy as Record<string, unknown>) || {};
        const count = Number(strategy.image_count || 1);
        const isCar = count <= 1 ? false : Boolean(strategy.is_carousel ?? false);
        const payload = {
          content_id: item.id,
          agent_id: item.agent_id,
          instruction: String(strategy.instruction || item.topic || '').trim(),
          channels: item.content_variants.map((v) => v.channel),
          image_count: count,
          image_style: String(strategy.image_style || 'Disney / Pixar'),
          image_quality: strategy.image_quality === 'medium' ? 'medium' : 'low',
          is_carousel: isCar,
          cta: String(strategy.cta || '').trim(),
          idempotency_key: crypto.randomUUID(),
        };

        const res = await fetch('/api/runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json.error || 'Falha ao iniciar geração do rascunho.');
        }

        const returnTo = searchParams.get('returnTo') || '/contents';
        router.push(returnTo);
        router.refresh();
      }, 'enqueued');
    } finally {
      setGeneratingDraft(false);
    }
  }

  async function handleRegenerateImage() {
    if (regenerating || action.busy) return;
    setRegenerating(true);
    const initialCount = positionMedias.length;
    try {
      await action.act(
        async () => {
          const res = await fetch(`/api/content/${item.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'regenerate_image',
              version: item.version,
              variant_id: variant.id,
              position,
              idempotency_key: crypto.randomUUID(),
            }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            if (json.error === 'insufficient_quota') {
              throw new Error('Saldo de cotas insuficiente para regenerar esta imagem.');
            }
            throw new Error(json.error || 'Falha ao solicitar regeneração.');
          }

          // Polling loop to wait for job completion
          let maxAttempts = 35;
          while (maxAttempts > 0) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            const latest = await api(`content/${item.id}`);
            const updatedPositionMedias = (
              latest.content_variants[index]?.content_media || []
            ).filter((m: { position: number }) => m.position === position);

            // Completed when a new media version is present or content returned from GENERATING
            if (updatedPositionMedias.length > initialCount || latest.status !== 'GENERATING') {
              setItem(latest);
              setCaption(latest.content_variants[index]?.caption || '');
              const sorted = updatedPositionMedias.sort(
                (a: { version?: number }, b: { version?: number }) =>
                  (a.version ?? 1) - (b.version ?? 1),
              );
              const newest = sorted[sorted.length - 1];
              if (newest?.version) {
                setSelectedVersion(newest.version);
              }
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('quota-updated'));
              }
              break;
            }
            maxAttempts--;
          }
          router.refresh();
        },
        'enqueued',
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao regenerar imagem';
      alert(msg);
    } finally {
      setRegenerating(false);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('quota-updated'));
      }
    }
  }
  return (
    <>
      <Link className="content-back" href={returnTo}>
        ← Voltar aos conteúdos
      </Link>
      {previewOpen && media?.url && (
        <dialog
          className="content-lightbox"
          aria-label="Imagem ampliada"
          ref={(node) => {
            if (node && !node.open) node.showModal();
          }}
          onCancel={() => setPreviewOpen(false)}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewOpen(false);
          }}
        >
          <button
            autoFocus
            className="icon-button"
            aria-label={t('close')}
            onClick={() => setPreviewOpen(false)}
          >
            <X />
          </button>
          <img src={media.url} alt={variant.title} />
        </dialog>
      )}
      {isDraft && (
        <div className="draft-banner">
          <div>
            <div className="draft-banner-title">Conteúdo em modo Rascunho</div>
            <div className="draft-banner-desc">
              Este conteúdo ainda não foi processado pela inteligência artificial. Você pode revisar as configurações ou gerar agora diretamente.
            </div>
          </div>
          {canEdit && (
            <div className="draft-banner-actions">
              <Button secondary onClick={() => setReviewModalOpen(true)}>
                Revisar Conteúdo
              </Button>
              <Button
                busy={generatingDraft || action.busy}
                onClick={handleDirectGenerateDraft}
              >
                <Sparkles size={14} style={{ marginRight: 6 }} />
                Gerar Agora
              </Button>
            </div>
          )}
        </div>
      )}
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
              setSelectedVersion(null);
            }}
          >
            {channels[v.channel].name}
          </button>
        ))}
      </div>
      <div className="detail-grid">
        <Card>
          <div className="editor-subtabs">
            <button
              type="button"
              className={`editor-subtab ${subTab === 'caption' ? 'active' : ''}`}
              onClick={() => setSubTab('caption')}
            >
              Legenda
            </button>
            <button
              type="button"
              className={`editor-subtab ${subTab === 'instruction' ? 'active' : ''}`}
              onClick={() => setSubTab('instruction')}
            >
              Pauta / instrução
            </button>
          </div>
          {variant ? (
            subTab === 'caption' ? (
              isDraft ? (
                <div className="draft-caption-empty-notice">
                  <FileText size={28} style={{ margin: '0 auto 10px', color: '#94a3b8' }} />
                  <h4 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 600, color: '#334155' }}>
                    Legenda não gerada (Rascunho)
                  </h4>
                  <p style={{ margin: '0 auto 16px', maxWidth: '380px', color: '#64748b', fontSize: '13px', lineHeight: 1.5 }}>
                    A legenda definitiva e as hashtags ainda não foram criadas para este conteúdo. O texto da sua pauta está salvo na aba <strong>Pauta / instrução</strong>.
                  </p>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                    <Button secondary onClick={() => setSubTab('instruction')}>
                      Ver Pauta / Instrução
                    </Button>
                    {canEdit && (
                      <Button secondary onClick={() => setReviewModalOpen(true)}>
                        Revisar Conteúdo
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <CaptionEditor key={variant.id} scope="content" id={item.id} variantId={variant.id}
                    value={caption} onChange={setCaption} limit={channels[variant.channel].limit}
                    disabled={!canEdit || ['GENERATING','PUBLISHING','PUBLISHED','ARCHIVED'].includes(item.status)}
                    onSave={async()=>{await api('captions','PATCH',{variant_id:variant.id,caption,version:item.version});const latest=await api('content/'+item.id);setItem(latest);router.refresh();}}/>
                </>
              )
            ) : (
              <div className="instruction-tab-pane">
                <label className="field-title">Texto da pauta / instrução</label>
                <div className="instruction-box">
                  {((item.strategy as Record<string, unknown>)?.instruction || item.topic) ? (
                    <p className="instruction-text">
                      {String((item.strategy as Record<string, unknown>)?.instruction || item.topic)}
                    </p>
                  ) : (
                    <p className="instruction-empty">
                      Nenhuma pauta específica foi inserida; conteúdo gerado automaticamente a partir das configurações do agente.
                    </p>
                  )}
                </div>
                {Boolean((item.strategy as Record<string, unknown>)?.image_style ||
                  (item.strategy as Record<string, unknown>)?.is_carousel !== undefined ||
                  (item.strategy as Record<string, unknown>)?.cta) && (
                  <div className="instruction-meta-grid">
                    {Boolean((item.strategy as Record<string, unknown>)?.image_style) && (
                      <div className="instruction-meta-item">
                        <span className="meta-label">Estilo da Imagem</span>
                        <strong className="meta-val">
                          {String((item.strategy as Record<string, unknown>).image_style)}
                        </strong>
                      </div>
                    )}
                    {(item.strategy as Record<string, unknown>)?.is_carousel !== undefined && (
                      <div className="instruction-meta-item">
                        <span className="meta-label">Formato</span>
                        <strong className="meta-val">
                          {(item.strategy as Record<string, unknown>).is_carousel
                            ? 'Carrossel (Sim)'
                            : 'Post único (Não)'}
                        </strong>
                      </div>
                    )}
                    {Boolean((item.strategy as Record<string, unknown>)?.cta) && (
                      <div className="instruction-meta-item">
                        <span className="meta-label">CTA</span>
                        <strong className="meta-val">
                          {String((item.strategy as Record<string, unknown>).cta)}
                        </strong>
                      </div>
                    )}
                  </div>
                )}
                {((item.strategy as Record<string, unknown>)?.instruction || item.topic) && (
                  <div className="form-row">
                    <Button
                      secondary
                      onClick={() =>
                        action.act(async () => {
                          await navigator.clipboard.writeText(
                            String((item.strategy as Record<string, unknown>)?.instruction || item.topic),
                          );
                        }, 'copied')
                      }
                    >
                      Copiar pauta
                    </Button>
                  </div>
                )}
              </div>
            )
          ) : (
            <Empty title={t('GENERATING')} />
          )}
          {isDraft && canEdit ? (
            <div className="draft-primary-actions" style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <Button
                busy={generatingDraft || action.busy}
                onClick={handleDirectGenerateDraft}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Sparkles size={14} />
                Gerar Agora
              </Button>
              <Button secondary onClick={() => setReviewModalOpen(true)}>
                Revisar Conteúdo
              </Button>
            </div>
          ) : null}
          {!isDraft && (
            <>
              <hr />
              <p className="muted">{t('approvalNote')}</p>
            </>
          )}
          {canEdit ? (
            <div className="form-row">
              {item.status === 'AWAITING_REVIEW' || item.status === 'ROUTINE' ? (
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', marginBottom: 8 }}>
                  {isConnected ? (
                    <>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 12px',
                          background: '#ecfdf5',
                          borderRadius: 6,
                          border: '1px solid #a7f3d0',
                          fontSize: '12px',
                          color: '#047857',
                        }}
                      >
                        <CheckCircle2 size={15} />
                        <span>
                          Canal <strong>{channels[variant.channel].name}</strong> conectado como{' '}
                          <strong>@{connection?.account_name || 'conta-vinculada'}</strong>
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Button
                          busy={action.busy}
                          onClick={() => operation('publish', { variant_id: variant?.id })}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                          <Send size={14} />
                          Publicar agora
                        </Button>
                      </div>
                      <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: 10, marginTop: 4 }}>
                        <Field label={`Agendar postagem · ${timezone}`}>
                          <input
                            type="datetime-local"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                          />
                        </Field>
                        <Button
                          secondary
                          busy={action.busy}
                          disabled={!date}
                          onClick={() =>
                            operation('schedule', {
                              scheduled_at: DateTime.fromISO(date, { zone: timezone }).toUTC().toISO(),
                              variant_id: variant?.id,
                            })
                          }
                          style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                          <Calendar size={14} />
                          Agendar postagem
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 10,
                          padding: '10px 14px',
                          background: '#fffbeb',
                          borderRadius: 6,
                          border: '1px solid #fde68a',
                          fontSize: '13px',
                          color: '#92400e',
                        }}
                      >
                        <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                        <div>
                          <strong>Canal {channels[variant.channel].name} não conectado</strong>
                          <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#b45309' }}>
                            Para agendar postagens ou publicar agora, conecte sua conta na página{' '}
                            <Link
                              href="/channels"
                              style={{ textDecoration: 'underline', fontWeight: 600, color: '#92400e' }}
                            >
                              Canais
                            </Link>.
                          </p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 10, opacity: 0.6 }}>
                        <Button secondary disabled title="Canal não conectado">
                          Publicar agora
                        </Button>
                        <Button secondary disabled title="Canal não conectado">
                          Agendar postagem
                        </Button>
                      </div>
                    </>
                  )}
                </div>
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
          {isDraft ? (
            <div className="draft-preview-placeholder">
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  background: '#f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 14,
                  color: '#6366f1',
                }}
              >
                <Sparkles size={26} />
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b', marginBottom: 6 }}>
                Prévia Indisponível em Rascunho
              </h3>
              <p
                style={{
                  fontSize: '13px',
                  color: '#64748b',
                  maxWidth: 300,
                  margin: '0 auto 16px',
                  lineHeight: 1.5,
                }}
              >
                Nenhuma imagem ou legenda foi gerada ainda. O conteúdo visual será produzido assim que a geração for iniciada.
              </p>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 14px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 20,
                  fontSize: '12px',
                  color: '#475569',
                }}
              >
                <Layers size={14} />
                <span>
                  {(item.strategy as Record<string, unknown>)?.is_carousel
                    ? `Carrossel (${(item.strategy as Record<string, unknown>)?.image_count || 2} imagens)`
                    : `Post único (${(item.strategy as Record<string, unknown>)?.image_count || 1} imagem)`}
                </span>
              </div>
            </div>
          ) : variant ? (
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
                  />
                ) : (
                  <Empty title={t('noImage')} />
                )}
                <p>{caption}</p>
              </div>
              {/* Carousel Position / Slides Navigator (if multiple slides) */}
              {variant.image_prompts && variant.image_prompts.length > 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', marginTop: 12 }}>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Slides do Carrossel
                  </span>
                  <div className="pagination preview-carousel-pages" style={{ margin: '4px 0' }}>
                    {variant.image_prompts.map((_, i) => (
                      <button
                        className={`preview-page-pill ${position === i ? 'active' : ''}`}
                        key={i}
                        aria-label={`Slide ${i + 1}`}
                        onClick={() => {
                          setPosition(i);
                          setSelectedVersion(null);
                        }}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Version Navigation (Imagem 1 - Original, Imagem 2 - 1ª regeneração, etc.) */}
              {positionMedias.length > 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', marginTop: 10 }}>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Versões desta Imagem
                  </span>
                  <div className="pagination preview-carousel-pages" style={{ margin: '4px 0' }}>
                    {positionMedias.map((m, idx) => {
                      const isCurrent = activeMedia?.id === m.id;
                      return (
                        <button
                          className={`preview-page-pill ${isCurrent ? 'active' : ''}`}
                          key={m.id}
                          aria-label={`Imagem ${idx + 1}`}
                          onClick={() => setSelectedVersion(m.version ?? idx + 1)}
                          title={idx === 0 ? 'Imagem 1 (Geração original)' : `Imagem ${idx + 1} (${idx}ª regeneração)`}
                        >
                          {idx + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* If single slide and only 1 version: show pill 1 for aesthetic parity */}
              {(!variant.image_prompts || variant.image_prompts.length <= 1) && positionMedias.length <= 1 && (
                <div className="pagination preview-carousel-pages">
                  <button className="preview-page-pill active" aria-label="1">
                    1
                  </button>
                </div>
              )}

              <div className="form-row preview-action-buttons">
                {media?.url ? (
                  <button
                    type="button"
                    className="btn-preview-open"
                    onClick={() => setPreviewOpen(true)}
                  >
                    <ExternalLink size={18} />
                    <span>Abrir</span>
                  </button>
                ) : null}
                {media?.url ? (
                  <a
                    className="btn-preview-download"
                    href={`/api/download?id=${media.id}&type=media`}
                    download
                  >
                    <Download size={18} />
                    <span>Baixar</span>
                  </a>
                ) : null}
                {canEdit && item.strategy?.source !== 'import' && ['ROUTINE', 'AWAITING_REVIEW', 'REJECTED', 'FAILED'].includes(item.status) ? (
                  <Button
                    secondary
                    busy={regenerating}
                    disabled={regenerating || action.busy}
                    onClick={handleRegenerateImage}
                  >
                    {regenerating ? 'Regenerando imagem...' : t('regenerateImage')}
                  </Button>
                ) : null}
              </div>
            </>
          ) : null}
        </Card>
      </div>
      <ContentFormModal
        open={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        agents={agents}
        defaultImageQuality={defaultImageQuality}
        draftItem={item}
        onSaved={async () => {
          const latest = await api(`content/${item.id}`);
          setItem(latest);
          router.refresh();
        }}
        onGenerated={() => {
          const returnTo = searchParams.get('returnTo') || '/contents';
          router.push(returnTo);
          router.refresh();
        }}
      />
    </>
  );
}
