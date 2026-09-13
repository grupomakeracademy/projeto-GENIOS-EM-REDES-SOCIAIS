'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Brand,
  Button,
  Card,
  Copyright,
  Field,
  Notice,
  useT,
  useAction,
  api,
} from '@/components/ui';
import { channels, type Channel } from '@/lib/domain';
const steps = [
  'company',
  'product',
  'audience',
  'positioning',
  'goals',
  'communication',
  'visual',
  'channels',
  'routine',
] as const;
export function Onboarding({ initial }: { initial: Record<string, unknown> }) {
  const router = useRouter(),
    t = useT(),
    action = useAction(),
    [step, setStep] = useState(0),
    [draft, setDraft] = useState<Record<string, unknown>>({
      company: '',
      agentName: '',
      product: '',
      audience: '',
      positioning: '',
      goals: '',
      communication: '',
      visual: '',
      channels: ['instagram'],
      timezone: 'America/Sao_Paulo',
      ...initial,
    });
  function field(key: string) {
    return (
      <Field label={t(key)}>
        {key === 'company' || key === 'agentName' || key === 'timezone' ? (
          <input
            required
            minLength={2}
            value={String(draft[key] || '')}
            onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
          />
        ) : (
          <textarea
            required
            minLength={3}
            value={String(draft[key] || '')}
            onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
          />
        )}
      </Field>
    );
  }
  return (
    <div className="onboarding">
      <Brand />
      <h1>{t('welcome')}</h1>
      <p className="muted">{t('onboardingIntro')}</p>
      <div
        className="progress"
        role="progressbar"
        aria-valuenow={step + 1}
        aria-valuemin={1}
        aria-valuemax={9}
        aria-label={t('welcome')}
      >
        <span style={{ width: `${((step + 1) / 9) * 100}%` }} />
      </div>
      <div className="onboarding-steps">
        {steps.map((s, i) => (
          <span key={s} className={i === step ? 'active' : ''}>
            {i + 1}. {t(s)}
          </span>
        ))}
      </div>
      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action.act(async () => {
              await api('onboarding', 'POST', { draft, complete: step === 8 });
              if (step === 8) {
                window.location.href = '/dashboard';
              } else setStep(step + 1);
            }, '');
          }}
        >
          <h2>{t(steps[step])}</h2>
          {step === 0 ? (
            <>
              {field('company')}
              {field('agentName')}
            </>
          ) : step === 7 ? (
            <div className="grid two">
              {Object.entries(channels).map(([key, c]) => (
                <label key={key} className="check">
                  <input
                    type="checkbox"
                    checked={(draft.channels as Channel[]).includes(key as Channel)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        channels: e.target.checked
                          ? [...(draft.channels as string[]), key]
                          : (draft.channels as string[]).filter((x) => x !== key),
                      })
                    }
                  />
                  {c.name}
                </label>
              ))}
            </div>
          ) : step === 8 ? (
            <>
              {field('timezone')}
            </>
          ) : (
            field(steps[step])
          )}
          <Notice {...action} />
          <footer>
            <Button secondary type="button" disabled={step === 0} onClick={() => setStep(step - 1)}>
              {t('back')}
            </Button>
            <Button
              secondary
              type="button"
              busy={action.busy}
              onClick={() =>
                action.act(async () => {
                  await api('onboarding', 'POST', { draft, complete: false });
                })
              }
            >
              {t('saveProgress')}
            </Button>
            <Button busy={action.busy} type="submit">
              {t(step === 8 ? 'finish' : 'next')}
            </Button>
          </footer>
        </form>
      </Card>
      <Copyright className="onboarding-copyright" />
    </div>
  );
}
