'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Plus,
  MessageSquare,
  Megaphone,
  Search,
  Send,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  CircleHelp,
  RefreshCw,
  ShieldCheck,
  Paperclip,
} from 'lucide-react';
import { Button, Card, Empty, Field, Notice, api, useAction, useT } from '@/components/ui';
import { categories, statuses, priorities, type SupportList, type TicketDetail } from './types';
import { NewTicket, FilePicker, uploadFiles, type Person } from './forms';
const eventNames: Record<string, string> = {
  TICKET_CREATED: 'Chamado criado',
  ANNOUNCEMENT_CREATED: 'Comunicado publicado',
  MESSAGE_SENT: 'Mensagem enviada',
  TICKET_REOPENED: 'Chamado reaberto',
  TICKET_CLOSED: 'Chamado encerrado',
  STATUS_CHANGED: 'Status alterado',
  PRIORITY_CHANGED: 'Prioridade alterada',
  ADMIN_ASSIGNED: 'Atendente atribuído',
};
function Badge({ value, label }: { value: string; label: string }) {
  return <span className={`badge support-${value}`}>{label}</span>;
}
export function Support({
  canAdmin,
  userId,
  timezone,
  workspaceName,
  initialTicket,
  workspaces,
  workspaceId,
}: {
  canAdmin: boolean;
  userId: string;
  timezone: string;
  workspaceName: string;
  initialTicket: string;
  workspaces: { id: string; name: string }[];
  workspaceId: string;
}) {
  const t = useT(),
    action = useAction();
  const router = useRouter();
  const [list, setList] = useState<SupportList | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [reload, setReload] = useState(0);
  const [tab, setTab] = useState('support'),
    [q, setQ] = useState(''),
    [status, setStatus] = useState(''),
    [category, setCategory] = useState(''),
    [priority, setPriority] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [person, setPerson] = useState(''),
    [page, setPage] = useState(0);
  const [people, setPeople] = useState<Person[]>([]),
    [selected, setSelected] = useState(initialTicket),
    [detail, setDetail] = useState<TicketDetail | null>(null),
    [detailError, setDetailError] = useState('');
  const [modal, setModal] = useState<'support' | 'announcement' | null>(null),
    [message, setMessage] = useState(''),
    [files, setFiles] = useState<File[]>([]),
    [pendingMessage, setPendingMessage] = useState<string | null>(null),
    [confirmation, setConfirmation] = useState('');
  const requestVersion = useRef({ value: 0 }),
    [detailReload, setDetailReload] = useState(0);
  const date = (value: string) =>
    new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(new Date(value));
  const refresh = () => {
    setReload((r) => r + 1);
    setDetailReload((r) => r + 1);
  };
  useEffect(() => {
    if (canAdmin)
      void api('support/people')
        .then((d) => setPeople(d.items))
        .catch(() => {});
  }, [canAdmin]);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      const query = new URLSearchParams({
        type: tab,
        q,
        status,
        category,
        priority,
        from,
        to,
        user: person,
        page: String(page),
      });
      void api(`support?${query}`)
        .then((data) => {
          if (active) setList(data);
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [tab, q, status, category, priority, from, to, person, page, reload]);
  const loadDetail = useCallback(async (id: string) => {
    const version = ++requestVersion.current.value;
    try {
      const data: TicketDetail = await api(`support/${id}`);
      if (version !== requestVersion.current.value) return;
      setDetail(data);
      setDetailError('');
      if (document.visibilityState === 'visible') {
        await api(`support/${id}/read`, 'POST', { seen: data.ticket.updated_at });
        setList((old) =>
          old
            ? { ...old, items: old.items.map((x) => (x.id === id ? { ...x, unread: false } : x)) }
            : old,
        );
      }
    } catch (e) {
      if (version === requestVersion.current.value)
        setDetailError(e instanceof Error ? e.message : 'internal_error');
    }
  }, []);
  useEffect(() => {
    if (!selected) return;
    const counter = requestVersion.current;
    const timer = window.setTimeout(() => void loadDetail(selected), 0);
    return () => {
      window.clearTimeout(timer);
      counter.value++;
    };
  }, [selected, loadDetail, detailReload]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        setReload((r) => r + 1);
        if (selected) void loadDetail(selected);
      }
    }, 30000);
    return () => window.clearInterval(timer);
  }, [selected, loadDetail]);
  function select(id: string) {
    setDetail(null);
    setDetailError('');
    setSelected(id);
    setMessage('');
    setFiles([]);
    setPendingMessage(null);
    history.replaceState(null, '', `/support?ticket=${id}`);
  }
  function back() {
    setSelected('');
    setDetail(null);
    history.replaceState(null, '', '/support');
  }
  function filter(setter: (v: string) => void, value: string) {
    setter(value);
    setPage(0);
  }
  async function change(field: string, value: string) {
    await api(`support/${selected}/${field}`, 'PATCH', { value });
    refresh();
  }
  const stats = list?.stats;
  return (
    <>
      <div className="page-heading support-heading">
        <div>
          <h1>Suporte</h1>
          <p>Central de atendimento, chamados e comunicados do Gênios para Redes Sociais.</p>
          <small className="muted">
            {canAdmin ? 'Central administrativa' : 'Seu atendimento'} · {workspaceName}
          </small>
        </div>
        <div className="support-actions">
          {canAdmin ? (
            <Button secondary onClick={() => setModal('announcement')}>
              <Megaphone size={18} />
              Novo comunicado
            </Button>
          ) : null}
          <Button onClick={() => setModal('support')}>
            <Plus size={18} />
            Novo chamado
          </Button>
        </div>
      </div>
      <Notice message={confirmation} />
      <div className={`support-stats ${canAdmin ? 'admin' : ''}`}>
        {[
          ...Object.entries(statuses),
          ...(canAdmin
            ? [
                ['alta', 'Alta prioridade'],
                ['closedToday', 'Fechados hoje'],
              ]
            : []),
        ].map(([key, label]) => (
          <div key={key} className="card support-stat">
            <span className={`support-stat-icon support-${key}`}>
              {key === 'fechado' || key === 'closedToday' ? (
                <CheckCircle2 size={22} />
              ) : key === 'em_andamento' ? (
                <Clock3 size={22} />
              ) : (
                <MessageSquare size={22} />
              )}
            </span>
            <span>
              <small>{label}</small>
              <strong>{stats?.[key] ?? '—'}</strong>
            </span>
          </div>
        ))}
      </div>
      <Card className="support-center">
        {canAdmin && workspaces.length > 1 ? (
          <div className="support-filters">
            <Field label="Workspace de atendimento">
              <select
                value={workspaceId}
                disabled={action.busy}
                onChange={(e) =>
                  void action.act(async () => {
                    await api('settings', 'POST', {
                      action: 'workspace_select',
                      id: e.target.value,
                    });
                    router.push('/support');
                    router.refresh();
                  }, '')
                }
              >
                {workspaces.map((w) => (
                  <option value={w.id} key={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        ) : null}
        <div className="support-tabs">
          <div role="tablist" aria-label="Área de suporte">
            {[
              ['support', canAdmin ? 'Todos os chamados' : 'Meus chamados'],
              ['announcement', 'Comunicados'],
            ].map(([id, label]) => (
              <button
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? 'active' : ''}
                key={id}
                onClick={() => {
                  setTab(id);
                  setPage(0);
                  back();
                }}
              >
                {id === 'support' ? <MessageSquare size={18} /> : <Megaphone size={18} />} {label}
              </button>
            ))}
          </div>
          <Button secondary onClick={refresh} aria-label="Atualizar suporte">
            <RefreshCw size={16} />
          </Button>
        </div>
        <div className="support-filters">
          <label className="support-search">
            <Search size={18} />
            <input
              aria-label="Buscar chamados"
              placeholder="Buscar por assunto, mensagem ou ID..."
              value={q}
              onChange={(e) => filter(setQ, e.target.value)}
              maxLength={200}
            />
          </label>
          <select
            aria-label="Filtrar status"
            value={status}
            onChange={(e) => filter(setStatus, e.target.value)}
          >
            <option value="">Todos os status</option>
            {Object.entries(statuses).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar categoria"
            value={category}
            onChange={(e) => filter(setCategory, e.target.value)}
          >
            <option value="">Todas as categorias</option>
            {Object.entries(categories).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar prioridade"
            value={priority}
            onChange={(e) => filter(setPriority, e.target.value)}
          >
            <option value="">Todas as prioridades</option>
            {Object.entries(priorities).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <Field label="De">
            <input type="date" value={from} onChange={(e) => filter(setFrom, e.target.value)} />
          </Field>
          <Field label="Até">
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => filter(setTo, e.target.value)}
            />
          </Field>
          {canAdmin ? (
            <select
              aria-label="Filtrar usuário"
              value={person}
              onChange={(e) => filter(setPerson, e.target.value)}
            >
              <option value="">Todos os usuários</option>
              {people.map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <div className={`support-layout ${selected ? 'has-selection' : ''}`}>
          <div className="support-list" aria-busy={loading}>
            {error ? (
              <div className="support-feedback">
                <Notice message={error} error />
                <Button secondary onClick={refresh}>
                  Tentar novamente
                </Button>
              </div>
            ) : loading && !list ? (
              <div className="support-skeleton" role="status" aria-label="Carregando chamados">
                {[1, 2, 3].map((n) => (
                  <div key={n} />
                ))}
              </div>
            ) : list?.items.length ? (
              list.items.map((ticket) => (
                <button
                  key={ticket.id}
                  className={`support-ticket ${selected === ticket.id ? 'selected' : ''} ${ticket.priority === 'alta' ? 'high' : ''}`}
                  onClick={() => select(ticket.id)}
                >
                  <span className="support-ticket-top">
                    <small>#{ticket.id.slice(0, 8)}</small>
                    {ticket.unread ? <span className="support-unread">Nova resposta</span> : null}
                  </span>
                  <strong>{ticket.title}</strong>
                  <span className="muted">{categories[ticket.category]}</span>
                  <span className="support-ticket-badges">
                    <Badge value={ticket.status} label={statuses[ticket.status]} />
                    <Badge value={ticket.priority} label={priorities[ticket.priority]} />
                  </span>
                  {canAdmin ? <small className="muted">{ticket.author_name}</small> : null}
                  <small className="muted">Aberto em {date(ticket.created_at)}</small>
                  <small className="muted">Atualizado em {date(ticket.updated_at)}</small>
                </button>
              ))
            ) : (
              <Empty
                title={
                  q || status || category || priority || from || to || person
                    ? 'Nenhum resultado para esses filtros.'
                    : tab === 'announcement'
                      ? 'Nenhum comunicado por enquanto.'
                      : 'Você ainda não abriu nenhum chamado.'
                }
              >
                <p className="muted">
                  Caso precise de ajuda com o Gênios para Redes Sociais, nossa equipe pode
                  acompanhar sua solicitação diretamente por aqui.
                </p>
                {tab === 'support' ? (
                  <Button onClick={() => setModal('support')}>Abrir meu primeiro chamado</Button>
                ) : null}
              </Empty>
            )}
            {list && list.total > 20 ? (
              <div className="support-pagination">
                <Button secondary disabled={page === 0} onClick={() => setPage(page - 1)}>
                  Anterior
                </Button>
                <small>
                  {page + 1} / {Math.ceil(list.total / 20)}
                </small>
                <Button
                  secondary
                  disabled={(page + 1) * 20 >= list.total}
                  onClick={() => setPage(page + 1)}
                >
                  Próxima
                </Button>
              </div>
            ) : null}
          </div>
          <div className="support-conversation">
            {!selected ? (
              <div className="support-welcome">
                <span className="empty-icon">
                  <MessageSquare size={32} />
                </span>
                <h2>Seu atendimento, em um só lugar</h2>
                <p className="muted">
                  Selecione um chamado para acompanhar a conversa, consultar anexos ou enviar uma
                  nova mensagem.
                </p>
                <div className="support-assurance">
                  <ShieldCheck size={18} />
                  Conversas e arquivos com acesso restrito.
                </div>
              </div>
            ) : (
              <>
                <button className="link-button support-back" onClick={back}>
                  <ArrowLeft size={16} />
                  Voltar aos chamados
                </button>
                {detailError ? (
                  <>
                    <Notice message={detailError} error />
                    <Button secondary onClick={() => void loadDetail(selected)}>
                      Tentar novamente
                    </Button>
                  </>
                ) : !detail ? (
                  <div className="support-skeleton" role="status" aria-label="Carregando conversa">
                    <div />
                    <div />
                  </div>
                ) : (
                  <>
                    <header className="support-detail-heading">
                      <small className="muted">#{detail.ticket.id}</small>
                      <h2>{detail.ticket.title}</h2>
                      <p className="muted">
                        {categories[detail.ticket.category]} · Aberto em{' '}
                        {date(detail.ticket.created_at)}
                      </p>
                      <div className="support-ticket-badges">
                        <Badge
                          value={detail.ticket.status}
                          label={statuses[detail.ticket.status]}
                        />
                        <Badge
                          value={detail.ticket.priority}
                          label={`Prioridade ${priorities[detail.ticket.priority].toLowerCase()}`}
                        />
                        {detail.ticket.ticket_type === 'announcement' ? (
                          <Badge
                            value="announcement"
                            label={
                              detail.ticket.target_type === 'geral'
                                ? 'Comunicado geral'
                                : 'Comunicado individual'
                            }
                          />
                        ) : null}
                      </div>
                      {detail.ticket.assigned_admin_id ? (
                        <p className="muted">
                          Atendido por:{' '}
                          {detail.ticket.assigned_admin_name ||
                            people.find((p) => p.user_id === detail.ticket.assigned_admin_id)
                              ?.name ||
                            'Equipe de suporte'}
                        </p>
                      ) : null}
                    </header>
                    {canAdmin ? (
                      <div className="support-admin-controls">
                        <Field label="Status">
                          <select
                            disabled={action.busy}
                            value={detail.ticket.status}
                            onChange={(e) =>
                              void action.act(() => change('status', e.target.value))
                            }
                          >
                            {Object.entries(statuses).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Prioridade">
                          <select
                            disabled={action.busy}
                            value={detail.ticket.priority}
                            onChange={(e) =>
                              void action.act(() => change('priority', e.target.value))
                            }
                          >
                            {Object.entries(priorities).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Button
                          secondary
                          busy={action.busy}
                          disabled={detail.ticket.assigned_admin_id === userId}
                          onClick={() => void action.act(() => change('assignee', 'self'))}
                        >
                          Assumir chamado
                        </Button>
                      </div>
                    ) : null}
                    <div className="support-messages">
                      {detail.messages.map((m) => (
                        <article
                          key={m.id}
                          className={`support-message ${m.is_admin_reply ? 'team' : ''}`}
                        >
                          <header>
                            <strong>{m.author_name}</strong>
                            <span className="muted">
                              {m.is_admin_reply
                                ? 'Equipe de suporte'
                                : m.author_role === 'ADMIN'
                                  ? 'Administrador · solicitante'
                                  : 'Solicitante'}
                            </span>
                            <time>{date(m.created_at)}</time>
                          </header>
                          <p>{m.message}</p>
                          {detail.attachments
                            .filter((a) => a.message_id === m.id)
                            .map((a) => (
                              <button
                                className="support-attachment"
                                key={a.id}
                                onClick={() =>
                                  void action.act(async () => {
                                    const d = await api(`support/attachments/${a.id}`);
                                    const link = document.createElement('a');
                                    link.href = d.url;
                                    link.rel = 'noopener';
                                    link.click();
                                  }, '')
                                }
                              >
                                {a.mime_type?.startsWith('image/') ? (
                                  <img
                                    src={`/api/support/attachments/${a.id}?preview=1`}
                                    alt={a.original_name}
                                    loading="lazy"
                                    style={{
                                      width: 100,
                                      height: 80,
                                      objectFit: 'contain',
                                      borderRadius: 8,
                                      background: 'var(--canvas)',
                                    }}
                                  />
                                ) : (
                                  <Paperclip size={16} />
                                )}
                                {a.original_name}
                                <small>{(a.size / 1024 / 1024).toFixed(1)} MB</small>
                              </button>
                            ))}
                        </article>
                      ))}
                    </div>
                    {detail.ticket.target_type === 'geral' ? (
                      <p className="support-readonly">
                        <Megaphone size={18} />
                        Este é um comunicado informativo. Para conversar com a equipe, abra um
                        chamado.
                      </p>
                    ) : (
                      <form
                        className="support-reply"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void action.act(async () => {
                            if (files.some((f) => f.size > 50 * 1024 * 1024))
                              throw new Error('support_file_limit');
                            const id =
                              pendingMessage ||
                              (await api(`support/${selected}/messages`, 'POST', { message })).id;
                            setPendingMessage(id);
                            try {
                              await uploadFiles(selected, id, files, (f) =>
                                setFiles((old) => old.filter((x) => x !== f)),
                              );
                            } catch {
                              await loadDetail(selected);
                              throw new Error('support_upload_partial');
                            }
                            setPendingMessage(null);
                            setMessage('');
                            setFiles([]);
                            refresh();
                          }, 'Mensagem enviada.');
                        }}
                      >
                        <Field label="Sua mensagem">
                          <textarea
                            placeholder="Escreva sua mensagem..."
                            value={message}
                            required
                            minLength={1}
                            maxLength={20000}
                            disabled={!!pendingMessage}
                            onChange={(e) => setMessage(e.target.value)}
                          />
                        </Field>
                        <FilePicker files={files} setFiles={setFiles} />
                        <Button busy={action.busy} disabled={!message.trim()} type="submit">
                          <Send size={17} />
                          {pendingMessage ? 'Tentar enviar os anexos novamente' : 'Enviar mensagem'}
                        </Button>
                      </form>
                    )}
                    <details className="support-history">
                      <summary>Histórico do atendimento</summary>
                      {detail.events.map((e) => (
                        <p key={e.id}>
                          <span>
                            {eventNames[e.event_type] || 'Atualização'}
                            {e.metadata.to
                              ? ` · ${statuses[e.metadata.to as keyof typeof statuses] || e.metadata.to}`
                              : ''}
                          </span>
                          <small className="muted">{date(e.created_at)}</small>
                        </p>
                      ))}
                    </details>
                  </>
                )}
              </>
            )}
            <Notice {...action} />
          </div>
        </div>
      </Card>
      <Card className="support-faq">
        <h2>
          <CircleHelp size={22} />
          Dúvidas frequentes
        </h2>
        {[
          ['Como funciona a aprovação de conteúdos?', t('faqApprovalAnswer')],
          [
            'Como configurar a Inteligência Artificial?',
            'Em Configurações → Inteligência Artificial, confira se o provedor está configurado e escolha os modelos para cada função.',
          ],
          [
            'Como configurar meu Gênio?',
            'Preencha o briefing inicial com as informações da sua empresa. Você pode revisar as preferências na área Agentes.',
          ],
          [
            'Como conectar uma rede social?',
            'Acesse Canais para conferir as opções de conexão e os recursos disponíveis para cada rede.',
          ],
          [
            'Como funciona a publicação automática?',
            'Ela depende de uma integração de publicação disponível e autorizada para o canal. Quando não houver integração, você pode baixar o conteúdo e publicar na rede.',
          ],
          [
            'Como alterar a rotina do meu Gênio?',
            'Abra Agentes, selecione seu Gênio e ajuste a rotina, os horários e o fuso horário.',
          ],
          [
            'Como regenerar uma imagem ou texto?',
            'Abra o conteúdo que deseja revisar e use as opções de gerar uma nova versão de texto ou imagem.',
          ],
          [
            'Como configurar credenciais de IA?',
            'A configuração é feita pelo responsável pelo servidor. Em Configurações → Credenciais de IA, você pode conferir o status com segurança.',
          ],
        ].map(([question, answer]) => (
          <details key={question}>
            <summary>{question}</summary>
            <p className="muted">{answer}</p>
          </details>
        ))}
      </Card>
      {modal ? (
        <NewTicket
          kind={modal}
          people={people}
          onClose={() => setModal(null)}
          onCreated={(id) => {
            setModal(null);
            setTab(modal);
            select(id);
            setReload((r) => r + 1);
            setConfirmation(
              modal === 'support' ? 'Chamado criado com sucesso.' : 'Comunicado publicado.',
            );
          }}
        />
      ) : null}
    </>
  );
}
