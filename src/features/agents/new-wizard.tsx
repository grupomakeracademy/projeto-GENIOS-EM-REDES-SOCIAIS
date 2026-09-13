'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Field, Notice, api, useAction } from '@/components/ui';
import { channels, type Channel } from '@/lib/domain';
const steps = [
  ['Novo Briefing', 'company', 'agentName'],
  ['Produto ou serviço', 'product'],
  ['Público', 'audience'],
  ['Posicionamento', 'positioning'],
  ['Objetivos', 'goals'],
  ['Comunicação', 'communication'],
  ['Identidade Visual', 'visual'],
  ['Canais'],
  ['Rotina'],
];
const labels: Record<string, string> = {
  company: 'Empresa / projeto',
  agentName: 'Nome do agente',
  product: 'Produto ou serviço',
  audience: 'Público-alvo',
  positioning: 'Posicionamento',
  goals: 'Objetivos',
  communication: 'Tom e instruções de comunicação',
  visual: 'Identidade e estilo visual',
};
export function NewAgentWizard({ draftKey }: { draftKey: string }) {
  const [step, setStep] = useState(0),
    [draft, setDraft] = useState<Record<string, unknown>>({
      company: '',
      agentName: '',
      product: '',
      audience: '',
      positioning: '',
      goals: '',
      communication: '',
      visual: '',
      channels: [],
      timezone: 'America/Sao_Paulo',
      local_time: '08:00',
      weekdays: [1, 2, 3, 4, 5],
      enabled: false,
      approval_required: true,
    });
  const action = useAction(),
    router = useRouter();
  const set = (key: string, value: unknown) => setDraft((old) => ({ ...old, [key]: value }));
  return (
    <div className="onboarding">
      <h1>Novo Briefing</h1>
      <p className="muted">Configure o contexto e a rotina do seu novo agente.</p>
      <div
        className="progress"
        role="progressbar"
        aria-valuenow={step + 1}
        aria-valuemin={1}
        aria-valuemax={9}
        aria-label="Etapas do briefing"
      >
        <span style={{ width: `${((step + 1) / 9) * 100}%` }} />
      </div>
      <div className="onboarding-steps">
        {steps.map(([label], i) => (
          <span key={label} className={i === step ? 'active' : ''}>
            {i + 1}. {label}
          </span>
        ))}
      </div>
      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (step < 8) {
              if (step === 7 && !(draft.channels as string[]).length) return;
              setStep(step + 1);
              return;
            }
            void action.act(async () => {
              const result = await api('agents', 'POST', { action: 'create_with_briefing', draft });
              sessionStorage.removeItem(draftKey);
              router.push(`/agents?agent=${result.id}`);
              router.refresh();
            });
          }}
        >
          <h2>{steps[step][0]}</h2>
          {steps[step].slice(1).map((key) => (
            <Field key={key} label={labels[key]}>
              {step === 0 ? (
                <input
                  required
                  minLength={2}
                  maxLength={key === 'agentName' ? 160 : 500}
                  value={String(draft[key])}
                  onChange={(e) => set(key, e.target.value)}
                />
              ) : (
                <textarea
                  required
                  minLength={3}
                  maxLength={10000}
                  value={String(draft[key])}
                  onChange={(e) => set(key, e.target.value)}
                />
              )}
            </Field>
          ))}
          {step === 7 && (
            <div className="grid two">
              {Object.entries(channels).map(([key, c]) => (
                <label className="check" key={key}>
                  <input
                    type="checkbox"
                    checked={(draft.channels as Channel[]).includes(key as Channel)}
                    onChange={(e) =>
                      set(
                        'channels',
                        e.target.checked
                          ? [...(draft.channels as string[]), key]
                          : (draft.channels as string[]).filter((x) => x !== key),
                      )
                    }
                  />
                  {c.name}
                </label>
              ))}
            </div>
          )}
          {step === 8 && (
            <>
              <Field label="Fuso horário">
                <input
                  required
                  value={String(draft.timezone)}
                  onChange={(e) => set('timezone', e.target.value)}
                />
              </Field>
              <Field label="Horário">
                <input
                  type="time"
                  required
                  value={String(draft.local_time)}
                  onChange={(e) => set('local_time', e.target.value)}
                />
              </Field>
              <div className="form-row">
                {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d, i) => (
                  <label key={d} className="check">
                    <input
                      type="checkbox"
                      checked={(draft.weekdays as number[]).includes(i + 1)}
                      onChange={(e) =>
                        set(
                          'weekdays',
                          e.target.checked
                            ? [...(draft.weekdays as number[]), i + 1]
                            : (draft.weekdays as number[]).filter((x) => x !== i + 1),
                        )
                      }
                    />
                    {d}
                  </label>
                ))}
              </div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={Boolean(draft.approval_required)}
                  onChange={(e) => set('approval_required', e.target.checked)}
                />
                Exigir aprovação
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={Boolean(draft.enabled)}
                  onChange={(e) => set('enabled', e.target.checked)}
                />
                Ativar rotina automática
              </label>
            </>
          )}
          <Notice {...action} />
          <footer>
            <Button
              secondary
              type="button"
              disabled={step === 0 || action.busy}
              onClick={() => setStep(step - 1)}
            >
              Voltar
            </Button>
            <Button
              secondary
              type="button"
              onClick={() =>
                void action.act(async () => {
                  sessionStorage.setItem(draftKey, JSON.stringify({ draft, step }));
                })
              }
            >
              Salvar progresso
            </Button>
            <Button
              secondary
              type="button"
              onClick={() =>
                void action.act(async () => {
                  const saved = sessionStorage.getItem(draftKey);
                  if (saved) {
                    const data = JSON.parse(saved);
                    setDraft(data.draft);
                    setStep(data.step);
                  }
                })
              }
            >
              Retomar rascunho
            </Button>
            <Button
              type="submit"
              busy={action.busy}
              disabled={
                (step === 7 && !(draft.channels as string[]).length) ||
                (step === 8 && !(draft.weekdays as number[]).length)
              }
            >
              {step === 8 ? 'Criar agente' : 'Próximo'}
            </Button>
          </footer>
        </form>
      </Card>
    </div>
  );
}
