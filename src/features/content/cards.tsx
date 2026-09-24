'use client';
import Link from 'next/link';
import { useState } from 'react';
import { MoreHorizontal, Trash2, ImageIcon, CalendarDays } from 'lucide-react';
import {
  Button,
  Modal,
  Notice,
  StatusBadge,
  api,
  useAction,
  useLocale,
  useT,
} from '@/components/ui';
import { SocialLogo } from '@/components/social-logos';
import { channels, type Channel, type Content } from '@/lib/domain';
import { useRouter } from 'next/navigation';

export function ContentActionsMenu({
  id,
  kind = 'content',
  title,
  onDeleted,
}: {
  id: string;
  kind?: 'content' | 'run';
  title: string;
  onDeleted?: () => void;
}) {
  const [confirm, setConfirm] = useState(false),
    action = useAction(),
    router = useRouter();
  return (
    <>
      <details className="execution-menu">
        <summary aria-label="Ações da execução">
          <MoreHorizontal size={19} />
        </summary>
        <div>
          <button onClick={() => setConfirm(true)}>
            <Trash2 size={15} /> Excluir execução
          </button>
        </div>
      </details>
      {confirm && (
        <Modal title="Excluir execução?" onClose={() => !action.busy && setConfirm(false)}>
          <p>
            A execução “{title}”, seus conteúdos e versões por rede social serão removidos do
            sistema. O processamento pendente será interrompido. Publicações já enviadas às redes
            sociais não serão apagadas.
          </p>
          <p>Esta ação não pode ser desfeita.</p>
          <Notice {...action} />
          <div className="form-row">
            <Button secondary disabled={action.busy} onClick={() => setConfirm(false)}>
              Cancelar
            </Button>
            <Button
              busy={action.busy}
              onClick={() =>
                void action.act(async () => {
                  await api('executions', 'DELETE', { id, kind });
                  setConfirm(false);
                  onDeleted?.();
                  router.refresh();
                })
              }
            >
              Excluir execução
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function ContentNetworks({ networks }: { networks: string[] }) {
  return (
    <div className="execution-networks">
      {[...new Set(networks)]
        .filter((n) => n in channels)
        .map((n) => (
          <span
            key={n}
            title={channels[n as Channel].name}
            aria-label={channels[n as Channel].name}
          >
            <SocialLogo channel={n as Channel} size={21} />
          </span>
        ))}
    </div>
  );
}
export function ContentUserAvatar({
  responsible,
}: {
  responsible?: { id?: string; name?: string; avatarUrl?: string };
}) {
  const name = responsible?.name?.trim() || 'Geninhos';
  const isGeninhos =
    !responsible?.name ||
    /geninho/i.test(name) ||
    /gênios/i.test(name) ||
    /genios/i.test(name);
  const avatarUrl = responsible?.avatarUrl || (isGeninhos ? '/mascot.png' : '');
  const initials =
    name
      .split(/\s+/)
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'G';

  return (
    <div
      className="execution-person execution-user-avatar-frame"
      title={name}
      aria-label={`Usuário: ${name}`}
      tabIndex={0}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name}
          className="execution-user-avatar-img"
          onError={(e) => {
            if (isGeninhos) {
              (e.currentTarget as HTMLImageElement).src = '/mascot.png';
            }
          }}
        />
      ) : (
        <span className="execution-user-avatar-initials">{initials}</span>
      )}
      <span className="execution-user-tooltip" role="tooltip">
        {name}
      </span>
    </div>
  );
}

export function ContentResponsibles({
  people = [],
}: {
  people?: { id: string; name: string; avatarUrl?: string }[];
}) {
  if (!people.length) return null;
  return (
    <div className="execution-people">
      {people.map((person) => (
        <ContentUserAvatar key={person.id} responsible={person} />
      ))}
    </div>
  );
}

export function ContentExecutionCard({
  item,
  mode,
  canEdit,
  returnTo,
}: {
  item: Content;
  mode: string;
  canEdit: boolean;
  returnTo: string;
}) {
  const t = useT(),
    locale = useLocale();
  const media = item.content_variants.flatMap((v) => v.content_media || []).find((m) => m.url);
  const href = `/contents/${item.id}?returnTo=${encodeURIComponent(returnTo)}`;
  const prompt =
    item.content_variants.find((v) => v.image_prompts?.length)?.image_prompts[0] ||
    item.content_variants.find((v) => v.visual_concept)?.visual_concept ||
    String(item.strategy?.hook || item.strategy?.core_message || '');
  return (
    <article className={`execution-card execution-${mode} card-status-${item.status}`}>
      <Link
        className="execution-cover"
        href={href}
        onClick={() => sessionStorage.setItem('content-scroll', String(window.scrollY))}
      >
        {media?.url ? (
          media.storage_path.endsWith('.mp4') ? <video src={media.url} preload="metadata" muted style={{objectFit:'contain'}} /> : <img src={media.url} alt={item.topic} loading="lazy" />
        ) : (
          <div className="execution-cover-placeholder">
            <ImageIcon size={28} />
          </div>
        )}
      </Link>
      <div className="execution-body">
        <div className="execution-top">
          <StatusBadge status={item.status} />
          {canEdit && <ContentActionsMenu id={item.id} title={item.topic} />}
        </div>
        <Link href={href}>
          <h3 className="execution-title">{item.topic || t('GENERATING')}</h3>
        </Link>
        {prompt ? (
          <p className="execution-context" title={prompt}>
            {prompt}
          </p>
        ) : (
          <p className="execution-context execution-context-empty">&nbsp;</p>
        )}
        <div className="execution-meta-row">
          <ContentNetworks networks={item.content_variants.map((v) => v.channel)} />
        </div>
        <div className="execution-footer-row">
          <div className="execution-footer-left">
            <small className="execution-date">
              <CalendarDays size={14} />
              {new Date(item.scheduled_at || item.created_at).toLocaleString(locale)}
            </small>
            <Link
              className="execution-analyze"
              href={href}
              onClick={() => sessionStorage.setItem('content-scroll', String(window.scrollY))}
            >
              Analisar por rede social →
            </Link>
          </div>
          <div className="execution-footer-avatar-wrap">
            <ContentUserAvatar responsible={item.responsibles?.[0]} />
          </div>
        </div>
      </div>
    </article>
  );
}
