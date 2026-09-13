'use client';
import { useState } from 'react';
import { Paperclip } from 'lucide-react';
import { Button, Field, Modal, Notice, api, useAction } from '@/components/ui';
import { categories, priorities } from './types';
export type Person = { user_id: string; name: string; role: string };
export function FilePicker({
  files,
  setFiles,
}: {
  files: File[];
  setFiles: (files: File[]) => void;
}) {
  const [fileError, setFileError] = useState('');
  return (
    <div className="support-files">
      <Field label="Anexos (opcional)">
        <input
          type="file"
          accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.webp,.csv,.xls,.xlsx,.mp3,.wav,.mp4"
          multiple
          onChange={(e) => {
            const selected = Array.from(e.target.files || []);
            if (selected.length + files.length > 3) {
              setFileError('Selecione no máximo 3 anexos por mensagem.');
              e.target.value = '';
              return;
            }
            setFileError('');
            setFiles([...files, ...selected]);
            e.target.value = '';
          }}
        />
      </Field>
      <small className="muted">
        Máximo de 3 anexos por mensagem, até 50 MB por arquivo. Documentos, planilhas, imagens,
        áudio e vídeo.
      </small>
      <Notice message={fileError} error />
      {files.map((f, i) => (
        <div className="support-file-row" key={`${f.name}-${i}`}>
          <Paperclip size={14} />
          <span>
            {f.name} · {(f.size / 1024 / 1024).toFixed(1)} MB
          </span>
          <button
            type="button"
            className="link-button"
            onClick={() => setFiles(files.filter((_, j) => j !== i))}
          >
            Remover
          </button>
        </div>
      ))}
    </div>
  );
}
export async function uploadFiles(
  ticket: string,
  message: string,
  files: File[],
  uploaded: (file: File) => void,
) {
  if (files.length > 3) throw new Error('Selecione no máximo 3 anexos por mensagem.');
  for (const file of files) {
    const body = new FormData();
    body.set('file', file);
    body.set('messageId', message);
    await api(`support/${ticket}/attachments`, 'POST', body);
    uploaded(file);
  }
}
export function NewTicket({
  kind,
  people,
  onClose,
  onCreated,
}: {
  kind: 'support' | 'announcement';
  people: Person[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const action = useAction(),
    [files, setFiles] = useState<File[]>([]),
    [target, setTarget] = useState('geral'),
    [created, setCreated] = useState<{ id: string; messageId: string } | null>(null);
  return (
    <Modal
      title={kind === 'support' ? 'Novo chamado' : 'Novo comunicado'}
      onClose={() => {
        if (!action.busy) {
          if (created) onCreated(created.id);
          else onClose();
        }
      }}
    >
      <form
        className="support-new"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          void action.act(async () => {
            if (files.some((f) => f.size > 50 * 1024 * 1024)) throw new Error('support_file_limit');
            const result =
              created ||
              (await api(kind === 'support' ? 'support' : 'support/announcements', 'POST', {
                title: data.get('title'),
                category: data.get('category'),
                priority: data.get('priority'),
                message: data.get('message'),
                ...(kind === 'announcement'
                  ? { target, recipient: target === 'individual' ? data.get('recipient') : null }
                  : {}),
              }));
            setCreated(result);
            try {
              await uploadFiles(result.id, result.messageId, files, (f) =>
                setFiles((old) => old.filter((x) => x !== f)),
              );
            } catch {
              throw new Error('support_upload_partial');
            }
            onCreated(result.id);
          }, 'Chamado criado.');
        }}
      >
        <fieldset disabled={!!created || action.busy}>
          {kind === 'announcement' ? (
            <>
              <Field label="Destinatários">
                <select value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="geral">Todos deste workspace</option>
                  <option value="individual">Um usuário específico</option>
                </select>
              </Field>
              {target === 'individual' ? (
                <Field label="Usuário">
                  <select name="recipient" required defaultValue="">
                    <option value="" disabled>
                      Selecione um usuário
                    </option>
                    {people.map((p) => (
                      <option key={p.user_id} value={p.user_id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
            </>
          ) : null}
          <div className="grid two">
            <Field label="Categoria">
              <select name="category" required defaultValue="">
                <option value="" disabled>
                  Selecione uma categoria
                </option>
                {Object.entries(categories).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Prioridade">
              <select name="priority" defaultValue="normal">
                {Object.entries(priorities).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Assunto">
            <input
              name="title"
              required
              minLength={3}
              maxLength={180}
              placeholder="Descreva brevemente o assunto"
            />
          </Field>
          <Field label="Mensagem">
            <textarea
              name="message"
              required
              maxLength={20000}
              placeholder="Conte o que aconteceu e como podemos ajudar."
            />
          </Field>
        </fieldset>
        <FilePicker files={files} setFiles={setFiles} />
        <Notice {...action} />
        <div className="support-modal-actions">
          <Button
            secondary
            type="button"
            disabled={action.busy}
            onClick={() => (created ? onCreated(created.id) : onClose())}
          >
            {created ? 'Abrir chamado criado' : 'Cancelar'}
          </Button>
          <Button type="submit" busy={action.busy}>
            {created
              ? 'Tentar enviar anexos novamente'
              : kind === 'support'
                ? 'Criar chamado'
                : 'Publicar comunicado'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
