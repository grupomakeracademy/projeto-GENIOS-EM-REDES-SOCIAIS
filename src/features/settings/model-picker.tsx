'use client';
import { useEffect, useState } from 'react';
import { Button, Field, Modal, Notice, api, useAction, useT } from '@/components/ui';
import type { AIConfig, ProviderId } from '@/lib/domain';
type Model = { model_id: string; display_name: string; capabilities: string[] };
export function ModelPicker({
  provider,
  purpose,
  value,
  disabled,
  onChange,
}: {
  provider: ProviderId;
  purpose: AIConfig['purpose'];
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const t = useT(),
    action = useAction(),
    [models, setModels] = useState<Model[]>([]),
    [open, setOpen] = useState(false),
    [modelId, setModelId] = useState(''),
    [name, setName] = useState(''),
    [loadError, setLoadError] = useState('');
  useEffect(() => {
    let active = true;
    api(`models?provider=${provider}`)
      .then((data) => {
        if (active) {
          setModels(data.items);
          setLoadError('');
        }
      })
      .catch(() => {
        if (active) setLoadError('database_error');
      });
    return () => {
      active = false;
    };
  }, [provider]);
  return (
    <>
      <Field label={t('model')}>
        <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          <option value="">{t('unconfigured')}</option>
          {models
            .filter((m) => m.capabilities.includes(purpose))
            .map((m) => (
              <option key={m.model_id} value={m.model_id}>
                {m.display_name}
              </option>
            ))}
        </select>
      </Field>
      <Notice message={loadError} error />
      {!disabled ? (
        <Button type="button" secondary onClick={() => setOpen(true)}>
          {t('registerModel')}
        </Button>
      ) : null}
      {open ? (
        <Modal title={t('registerModel')} onClose={() => setOpen(false)}>
          <Field label={t('model')}>
            <input value={modelId} onChange={(e) => setModelId(e.target.value)} maxLength={160} />
          </Field>
          <Field label={t('name')}>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={160} />
          </Field>
          <p className="muted">{t('registerModelHint')}</p>
          <Notice {...action} />
          <Button
            busy={action.busy}
            disabled={!modelId || !name}
            type="button"
            onClick={() =>
              action.act(async () => {
                await api('models', 'POST', {
                  provider,
                  purpose,
                  model: modelId,
                  display_name: name,
                });
                setModels((await api(`models?provider=${provider}`)).items);
                onChange(modelId);
                setOpen(false);
              })
            }
          >
            {t('save')}
          </Button>
        </Modal>
      ) : null}
    </>
  );
}
