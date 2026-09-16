'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Upload, Download, ExternalLink } from 'lucide-react';
import { Card, Button, Field, Notice, api } from '@/components/ui';
import { SocialLogo } from '@/components/social-logos';
import { channels, type Channel } from '@/lib/domain';
import type { Capabilities } from '@/lib/social/connectors';
import styles from './view.module.css';
import { CaptionEditor } from '@/features/captions/editor';
type Draft = {
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
  const [draft, setDraft] = useState<Draft | null>(null),
    [caption, setCaption] = useState(''),
    [channel, setChannel] = useState<Channel | ''>('');
  const [accountData, setAccountData] = useState<{agent:string;items:Account[]}>({agent:'',items:[]}),
    [account, setAccount] = useState(''),
    [busy, setBusy] = useState(false);
  const loadingAccounts=!!agent&&accountData.agent!==agent;
  const accounts=accountData.agent===agent?accountData.items:[];
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
    let live=true;
    void api('imports?recent=1').then(data=>{if(live)setRecent(data.items);}).catch(()=>{if(live)setMessage('Não foi possível carregar as importações.');});
    return ()=>{live=false;};
  }, []);
  useEffect(() => {
    let live = true;
    if (!agent) return;
    void api(`channels?agent=${encodeURIComponent(agent)}`)
      .then((data) => {
        if (live) setAccountData({agent,items:data.items||[]});
      })
      .catch(() => {
        if (live) {
          setError(true);
          setMessage('Não foi possível consultar os canais.');
          setAccountData({agent,items:[]});
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
      setError(true);
      setMessage(e instanceof Error ? e.message : 'internal_error');
    } finally {
      setBusy(false);
    }
  }
  const selected = accounts.find((a) => a.id === account),
    activeChannel = selected?.channel || channel;
  const editable = canEdit && !busy && draft?.import_status !== 'Publicado';
  const ready =
    editable &&
    !!draft &&
    !!caption.trim() &&
    !!activeChannel &&
    caption.length <= channels[activeChannel].limit;
  const canPublish = ready && !!selected && capabilities[selected.channel]?.canPublish;
  const canSchedule = ready && !!selected && capabilities[selected.channel]?.canSchedule;
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
                <strong>Enviar imagem pronta</strong>
                <span>JPG, PNG ou WebP · até 10 MB</span>
                <input
                  aria-label="Enviar imagem pronta"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={!editable || !agent}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void perform(async () => {
                      const form = new FormData();
                      form.set('file', file);
                      form.set('agent_id', agent);
                      const row = await api('imports', 'POST', form);
                      await load(row.id);
                      await refreshRecent();
                    });
                    e.target.value = '';
                  }}
                />
              </label>
            ) : (
              <p>
                Imagem original preservada · {draft.width} × {draft.height} px
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
              }}
            >
              Nova importação
            </Button>
          </Card>
        </div>
        <Card className={styles.preview}>
          <h2>Preview da postagem</h2>
          <div className="preview-frame phone">
            <header>
              {activeChannel ? <SocialLogo channel={activeChannel} /> : null}
              <strong>
                {selected?.account_name ||
                  agents.find((a) => a.id === agent)?.name ||
                  'Sua publicação'}
              </strong>
            </header>
            {draft ? (
              <img
                src={draft.url}
                alt="Imagem original importada"
                width={draft.width}
                height={draft.height}
                style={{ width: '100%', height: 'auto', objectFit: 'contain' }}
              />
            ) : (
              <div className={styles.placeholder}>
                <Upload />
                <p>Envie uma imagem para visualizar</p>
              </div>
            )}
            <p className={styles.caption}>{caption || 'Sua legenda aparecerá aqui.'}</p>
          </div>
          {draft ? (
            <div className="form-row preview-action-buttons">
              <a className="btn-preview-open" href={draft.url} target="_blank" rel="noreferrer">
                <ExternalLink size={18} /> Abrir
              </a>
              <a
                className="btn-preview-download"
                href={`/api/imports/${draft.id}?download=1`}
                download
              >
                <Download size={18} /> Baixar
              </a>
            </div>
          ) : null}
        </Card>
      </div>
    </>
  );
}
