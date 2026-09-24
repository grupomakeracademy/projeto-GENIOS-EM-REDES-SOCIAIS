'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Upload } from 'lucide-react';
import { Card, Button, Field, Notice, api } from '@/components/ui';
import { ImportPreview, type ImportPreviewRecord } from './preview';
import { MAX_IMPORT_IMAGES, MAX_IMPORT_IMAGE_BYTES } from './images';
import {
  channels,
  type Channel,
  type Destination,
  destinations,
  getChannelDestinations,
} from '@/lib/domain';
import type { Capabilities } from '@/lib/social/connectors';
import styles from './view.module.css';
import { CaptionEditor } from '@/features/captions/editor';
type Draft = ImportPreviewRecord & {
  title: string;
  channel: Channel | null;
  connection_id: string | null;
  import_status: string;
  scheduled_at: string | null;
  id: string;
  agent_id: string;
  caption: string;
  url: string;
  width: number;
  height: number;
  magic_used_at: string | null;
  content_id: string | null;
};
type Account = { id: string; agent_id: string; channel: Channel; account_name: string };
export function ImportView({
  agents,
  canEdit,
  capabilities,
}: {
  agents: { id: string; name: string }[];
  canEdit: boolean;
  capabilities: Record<string, Capabilities>;
}) {
  const params = useSearchParams();
  const [agent, setAgent] = useState(
    agents.find((a) => a.id === params.get('agent'))?.id || agents[0]?.id || '',
  );
  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState<Destination | ''>('');
  const [draft, setDraft] = useState<Draft | null>(null),
    [caption, setCaption] = useState(''),
    [channel, setChannel] = useState<Channel | ''>('');
  const [accountData, setAccountData] = useState<{ agent: string; items: Account[] }>({
      agent: '',
      items: [],
    }),
    [account, setAccount] = useState(''),
    [busy, setBusy] = useState(false);
  const loadingAccounts = !!agent && accountData.agent !== agent;
  const accounts = accountData.agent === agent ? accountData.items : [];
  const [message, setMessage] = useState(''),
    [error, setError] = useState(false),
    [date, setDate] = useState(''),
    [time, setTime] = useState('');
  const [recent, setRecent] = useState<
    { id: string; caption: string; content_id: string | null }[]
  >([]);
  async function refreshRecent() {
    const data = await api('imports?recent=1');
    setRecent(data.items);
  }
  useEffect(() => {
    const id = params.get('id');
    if (id) void perform(() => load(id));
  }, [params]);
  useEffect(() => {
    let live = true;
    void api('imports?recent=1')
      .then((data) => {
        if (live) setRecent(data.items);
      })
      .catch(() => {
        if (live) setMessage('Não foi possível carregar as importações.');
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    let live = true;
    if (!agent) return;
    void api(`channels?agent=${encodeURIComponent(agent)}`)
      .then((data) => {
        if (live) setAccountData({ agent, items: data.items || [] });
      })
      .catch(() => {
        if (live) {
          setError(true);
          setMessage('Não foi possível consultar os canais.');
          setAccountData({ agent, items: [] });
        }
      });
    return () => {
      live = false;
    };
  }, [agent]);
  async function load(id: string) {
    const data = await api(`imports/${id}`);
    setDraft(data);
    setCaption(data.caption);
    setAgent(data.agent_id);
    setTitle(data.title || '');
    setChannel(data.channel || '');
    setAccount(data.connection_id || '');
  }
  async function perform(work: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    setError(false);
    try {
      await work();
    } catch (e) {
      console.error('[Import Flow Error]', e);
      setError(true);
      setMessage(e instanceof Error ? e.message : 'internal_error');
    } finally {
      setBusy(false);
    }
  }
  const selected = accounts.find((a) => a.id === account),
    activeChannel = selected?.channel || channel;
  const supportedDestinations = activeChannel ? getChannelDestinations(activeChannel) : (['feed'] as Destination[]);
  const effectiveDestination =
    supportedDestinations.length === 1
      ? 'feed'
      : destination && supportedDestinations.includes(destination as Destination)
      ? destination
      : '';
  const isDestinationValid = !activeChannel || supportedDestinations.length === 1 || !!effectiveDestination;
  const editable = canEdit && !busy && draft?.import_status !== 'Publicado';
  const ready =
    editable &&
    !!draft &&
    !!caption.trim() &&
    !!activeChannel &&
    caption.length <= channels[activeChannel].limit;
  const canPublish = ready && !!selected && capabilities[selected.channel]?.canPublish && isDestinationValid;
  const canSchedule = ready && !!selected && capabilities[selected.channel]?.canSchedule && isDestinationValid;
  async function saveDraft() {
    await api('imports/' + draft!.id, 'PATCH', {
      title,
      caption,
      channel: activeChannel || null,
      connection_id: account || null,
    });
    await refreshRecent();
  }
  async function submit(action: 'publish' | 'schedule') {
    await perform(async () => {
      const result = await api(`imports/${draft!.id}`, 'POST', {
        action,
        caption,
        channel: activeChannel,
        connection_id: account || undefined,
        scheduled_at: action === 'schedule' ? new Date(`${date}T${time}`).toISOString() : undefined,
        destination: effectiveDestination || undefined,
      });
      await load(draft!.id);
      await refreshRecent();
      setDraft((current) => (current ? { ...current, content_id: result.content_id } : current));
      setMessage(action === 'schedule' ? 'Postagem agendada.' : 'Publicação solicitada.');
    });
  }
  return (
    <>
      <header className="page-header">
        <div>
          <h1>Importar</h1>
          <p>Use sua imagem pronta e prepare a legenda para suas redes sociais.</p>
        </div>
      </header>
      <Notice message={message} error={error} />
      {!agents.length ? (
        <Notice message="Cadastre um agente para organizar suas importações." />
      ) : null}
      <div className={styles.layout}>
        <div className={styles.fields}>
          <Card>
            <h2>Imagem e legenda</h2>
            <Field label="Agente">
              <select
                value={agent}
                disabled={!!draft || busy || !canEdit}
                onChange={(e) => setAgent(e.target.value)}
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            {!draft ? (
              <label className={styles.upload}>
                <Upload size={28} />
                <strong>Enviar imagens prontas</strong>
                <span>De 1 a 6 imagens · JPG, PNG ou WebP · até 10 MB por imagem</span>
                <input
                  aria-label="Enviar imagens prontas"
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  disabled={!editable || !agent}
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    if (!files.length) return;
                    void perform(async () => {
                      if (files.length > MAX_IMPORT_IMAGES)
                        throw new Error('Selecione de 1 a 6 imagens por postagem.');

                      console.log('[Import Frontend] Selected files:', {
                        count: files.length,
                        files: files.map((f, i) => ({
                          index: i,
                          name: f.name,
                          size: f.size,
                          type: f.type,
                        })),
                        agent,
                      });

                      const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
                      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'image/pjpeg'];

                      for (const file of files) {
                        const ext = file.name.includes('.')
                          ? '.' + file.name.split('.').pop()!.toLowerCase()
                          : '';
                        const mime = (file.type || '').toLowerCase();
                        const isExtAllowed = allowedExts.includes(ext);
                        const isMimeAllowed = !mime || allowedMimes.includes(mime);

                        if (!isExtAllowed && !isMimeAllowed) {
                          throw new Error(`Formato não suportado no arquivo "${file.name}". Use JPG, PNG ou WebP.`);
                        }

                        if (file.size > MAX_IMPORT_IMAGE_BYTES) {
                          throw new Error(`O arquivo "${file.name}" ultrapassa o limite de 10 MB.`);
                        }
                      }

                      const form = new FormData();
                      files.forEach((file) => form.append('file', file));
                      form.set('agent_id', agent);

                      console.log('[Import Frontend] Submitting FormData to /api/imports...');
                      const row = await api('imports', 'POST', form);
                      console.log('[Import Frontend] Upload successful. Row:', row);

                      await load(row.id);
                      await refreshRecent();
                    });
                    e.target.value = '';
                  }}
                />
              </label>
            ) : (
              <p>
                {(draft.images?.length || 1) > 1
                  ? `${draft.images!.length} imagens originais preservadas · ordem de seleção mantida`
                  : `Imagem original preservada · ${draft.width} × ${draft.height} px`}
              </p>
            )}
            <Field label="Título">
              <input
                value={title}
                maxLength={200}
                disabled={!editable}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <CaptionEditor
              key={draft?.id || 'new'}
              scope="import"
              id={draft?.id || ''}
              value={caption}
              onChange={setCaption}
              onSave={async () => {
                await api('imports/' + draft!.id, 'PATCH', { caption_only: true, caption });
                await refreshRecent();
              }}
              disabled={!editable || !draft}
              limit={activeChannel ? channels[activeChannel].limit : 63206}
            />
            {draft ? (
              <p>
                {draft.import_status}
                {draft.scheduled_at
                  ? ' · ' + new Date(draft.scheduled_at).toLocaleString('pt-BR')
                  : ''}
              </p>
            ) : null}
          </Card>
          <Card>
            <h2>Destino da publicação</h2>
            <Field label="Conta conectada">
              <select
                value={account}
                disabled={!editable || loadingAccounts || !!draft?.content_id}
                onChange={(e) => setAccount(e.target.value)}
              >
                <option value="">
                  {loadingAccounts ? 'Consultando canais…' : 'Selecione uma conta'}
                </option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {channels[a.channel]?.name} · {a.account_name}
                  </option>
                ))}
              </select>
            </Field>
            {!loadingAccounts && !accounts.length ? (
              <p>
                Nenhuma conta conectada para este agente.{' '}
                <Link href={`/channels?agent=${agent}`}>Ir para Canais</Link>
              </p>
            ) : null}
            {selected && !capabilities[selected.channel]?.canPublish ? (
              <Notice message="Esta conexão ainda não está apta à publicação automática." />
            ) : null}
            {!account ? (
              <Field label="Rede para preparar o conteúdo">
                <select
                  value={channel}
                  disabled={!editable || !!draft?.content_id}
                  onChange={(e) => setChannel(e.target.value as Channel)}
                >
                  <option value="">Sem canal selecionado</option>
                  {Object.entries(channels).map(([id, ch]) => (
                    <option key={id} value={id}>
                      {ch.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            {activeChannel ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '8px 0 12px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--foreground)' }}>
                  Onde deseja publicar?
                </label>
                <div className="carousel-segmented-control" style={{ alignSelf: 'flex-start' }}>
                  {supportedDestinations.map((d) => (
                    <button
                      key={d}
                      type="button"
                      disabled={!editable}
                      className={`carousel-pill ${effectiveDestination === d ? 'active' : ''}`}
                      onClick={() => setDestination(d)}
                    >
                      {destinations[d].label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className={styles.dates}>
              <Field label="Data">
                <input
                  type="date"
                  value={date}
                  disabled={!editable}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
              <Field label="Horário">
                <input
                  type="time"
                  value={time}
                  disabled={!editable}
                  onChange={(e) => setTime(e.target.value)}
                />
              </Field>
            </div>
            <p className={styles.hint}>Horário local do seu dispositivo.</p>
            <div className={styles.actions}>
              <Button disabled={!canPublish} onClick={() => void submit('publish')}>
                Publicar agora
              </Button>
              <Button
                secondary
                disabled={
                  !canSchedule ||
                  !date ||
                  !time ||
                  new Date(`${date}T${time}`).getTime() <= Date.now()
                }
                onClick={() => void submit('schedule')}
              >
                Agendar postagem
              </Button>
            </div>
            <div className={styles.actions}>
              <Button
                secondary
                disabled={!editable || !draft}
                onClick={() =>
                  void perform(async () => {
                    await saveDraft();
                    setMessage('Rascunho salvo.');
                  })
                }
              >
                Salvar rascunho
              </Button>
              {draft?.content_id ? (
                <Link href={`/contents/${draft.content_id}`}>Ver conteúdo salvo</Link>
              ) : null}
            </div>
          </Card>
          <Card>
            <h2>Importações recentes</h2>
            <Link href="/import/all">Ver todas as importações</Link>
            {recent.length ? (
              recent.map((r) => (
                <button
                  className={styles.recent}
                  key={r.id}
                  disabled={busy}
                  onClick={() => void perform(() => load(r.id))}
                >
                  {r.caption.slice(0, 85) || 'Imagem enviada — legenda pendente'}
                </button>
              ))
            ) : (
              <p>Suas imagens importadas aparecerão aqui.</p>
            )}
            <Button
              secondary
              disabled={busy || !canEdit}
              onClick={() => {
                setDraft(null);
                setTitle('');
                setChannel('');
                setCaption('');
                setMessage('');
                setAccount('');
                setDestination('');
              }}
            >
              Nova importação
            </Button>
          </Card>
        </div>
        <ImportPreview
          key={draft?.id || 'empty'}
          item={draft}
          title={
            selected?.account_name || agents.find((a) => a.id === agent)?.name || 'Sua publicação'
          }
          caption={caption}
          channel={activeChannel}
        />
      </div>
    </>
  );
}
