'use client';
import { useState } from 'react';
import { Button, Field, Notice, api } from '@/components/ui';
export function CaptionEditor({
  scope,
  id,
  variantId,
  value,
  onChange,
  onSave,
  disabled = false,
  limit = 63206,
}: {
  scope: 'import' | 'content';
  id: string;
  variantId?: string;
  value: string;
  onChange: (value: string) => void;
  onSave: () => Promise<void>;
  disabled?: boolean;
  limit?: number;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState(false);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    setError(false);
    try {
      await work();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível concluir.');
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  async function improve(kind: 'magic' | 'storytelling') {
    const result = await api('captions', 'POST', {
      scope,
      id,
      variant_id: variantId,
      kind,
      request_id: crypto.randomUUID(),
      caption: value,
    });
    onChange(result.caption);
    window.dispatchEvent(new CustomEvent('quota-updated', { detail: { balance: result.balance } }));
    const name = kind === 'magic' ? 'Prompt Mágico' : 'Storytelling';
    setMessage(
      result.cost === 0
        ? `Seu primeiro ${name} foi gratuito. As próximas utilizações deste recurso neste conteúdo consumirão 1 cota cada.`
        : `${name} concluído. Foi consumida 1 cota. Revise e salve a legenda.`,
    );
  }
  return (
    <div>
      <Field label="Editar legenda">
        <textarea
          rows={9}
          value={value}
          maxLength={limit}
          disabled={disabled || busy}
          onChange={(e) => onChange(e.target.value)}
        />
        <small>
          {value.length} / {limit}
        </small>
      </Field>
      <div className="form-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button
          secondary
          disabled={busy || !value}
          onClick={() =>
            void run(async () => {
              await navigator.clipboard.writeText(value);
              setMessage('Texto copiado.');
            })
          }
        >
          Copiar texto
        </Button>
        <Button
          secondary
          disabled={disabled || busy || !id || !value.trim()}
          onClick={() => void run(() => improve('magic'))}
        >
          Prompt Mágico
        </Button>
        <Button
          secondary
          disabled={disabled || busy || !id || !value.trim()}
          onClick={() => void run(() => improve('storytelling'))}
        >
          Storytelling
        </Button>
        <Button
          style={{ marginLeft: 'auto' }}
          disabled={disabled || busy || !id}
          onClick={() =>
            void run(async () => {
              await onSave();
              setMessage('Alterações salvas.');
            })
          }
        >
          Salvar alterações
        </Button>
      </div>
      <Notice message={message} error={error} />
    </div>
  );
}
