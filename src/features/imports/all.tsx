'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Card, Notice, Modal, api } from '@/components/ui';
import { SocialLogo } from '@/components/social-logos';
import type { Channel } from '@/lib/domain';
import styles from './view.module.css';
import { ImportPreview, type ImportPreviewRecord } from './preview';
type ImportRow = ImportPreviewRecord & {
  id: string;
  title: string;
  caption: string;
  url: string;
  width: number;
  height: number;
  channel: Channel | null;
  import_status: string;
};
export function AllImports({
  agents,
  canEdit,
}: {
  agents: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const [rows, setRows] = useState<ImportRow[]>([]),
    [selected, setSelected] = useState<ImportRow | null>(null),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1);
  const [query, setQuery] = useState(''),
    [status, setStatus] = useState(''),
    [agent, setAgent] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [deleting, setDeleting] = useState<ImportRow | null>(null),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      setBusy(true);
      void api('imports?' + new URLSearchParams({ page: String(page), q: query, status, agent }))
        .then((data) => {
          if (!live) return;
          setRows(data.items);
          setTotal(data.total);
          setSelected(
            (old) => data.items.find((r: ImportRow) => r.id === old?.id) || data.items[0] || null,
          );
          setError('');
          const last = Math.max(1, Math.ceil(data.total / 20));
          if (page > last) setPage(last);
        })
        .catch((e) => {
          if (live) setError(e.message);
        })
        .finally(() => {
          if (live) setBusy(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      live = false;
    };
  }, [page, query, status, agent, revision]);
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api('imports/' + deleting.id, 'DELETE');
      setDeleting(null);
      setRevision((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível excluir.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="page-header">
        <div>
          <h1>Todas as importações</h1>
          <p>
            {total} {total === 1 ? 'importação' : 'importações'}
          </p>
        </div>
        <Link href="/import">Nova importação</Link>
      </header>
      <Notice message={error} error />
      <div className="form-row">
        <input
          aria-label="Buscar importações"
          placeholder="Buscar por título ou legenda"
          value={query}
          onChange={(e) => {
            setPage(1);
            setQuery(e.target.value);
          }}
        />
        <select
          aria-label="Filtrar status"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          <option value="">Todos</option>
          {['Rascunho', 'Agendado', 'Publicado'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          aria-label="Filtrar agente"
          value={agent}
          onChange={(e) => {
            setPage(1);
            setAgent(e.target.value);
          }}
        >
          <option value="">Todos os agentes</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.layout}>
        <div aria-busy={busy}>
          {rows.map((row) => (
            <Card key={row.id} className={styles.historyRow}>
              {row.mime_type === 'video/mp4' ? <video src={row.url} width={64} height={84} muted preload="metadata" style={{objectFit:'contain'}} /> : <img
                src={row.url}
                alt={row.title || 'Imagem importada'}
                width={64}
                height={84}
                style={{ objectFit: 'contain', flexShrink: 0 }}
              />}
              <div style={{ minWidth: 0, flex: 1 }}>
                <h3>{row.title || 'Importação sem título'}</h3>
                <p className={styles.excerpt}>{row.caption || 'Sem legenda'}</p>
                <div className="form-row">
                  {row.channel ? <SocialLogo channel={row.channel} /> : null}
                  <span className="badge">{row.import_status}</span>
                </div>
                <div className="form-row">
                  <Button secondary disabled={busy} onClick={() => setSelected(row)}>
                    Visualizar
                  </Button>
                  <Link href={'/import?id=' + row.id}>Abrir</Link>
                  {canEdit ? (
                    <Button secondary disabled={busy} onClick={() => setDeleting(row)}>
                      Excluir
                    </Button>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
          {!rows.length && !busy ? <Card>Nenhuma importação encontrada.</Card> : null}
          <nav aria-label="Paginação das importações" className="form-row">
            <Button secondary disabled={busy || page <= 1} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <span>
              Página {page} de {Math.max(1, Math.ceil(total / 20))}
            </span>
            <Button
              secondary
              disabled={busy || page * 20 >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Próximo
            </Button>
          </nav>
        </div>
        {selected ? (
          <ImportPreview
            key={selected.id}
            item={selected}
            title={selected.title || 'Sua publicação'}
            caption={selected.caption}
            channel={selected.channel}
          />
        ) : (
          <Card className={styles.preview}>
            <h2>Preview da postagem</h2>
            <p>Selecione uma importação.</p>
          </Card>
        )}
      </div>
      {deleting ? (
        <Modal
          title="Excluir importação?"
          onClose={() => {
            if (!busy) setDeleting(null);
          }}
        >
          <p>Esta ação removerá esta importação do sistema. Deseja continuar?</p>
          <p>
            Agendamentos serão cancelados. Publicações já realizadas nas redes sociais serão
            preservadas.
          </p>
          <div className="form-row">
            <Button secondary disabled={busy} onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
            <Button disabled={busy} onClick={() => void remove()}>
              Excluir
            </Button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
