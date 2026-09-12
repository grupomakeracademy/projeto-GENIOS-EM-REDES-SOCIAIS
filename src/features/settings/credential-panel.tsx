'use client';
import { useEffect, useState } from 'react';
import { KeyRound, Check, AlertTriangle } from 'lucide-react';
import { Card, Button, Notice, api, useAction, useT } from '@/components/ui';

export type CredentialStatus = {
  openaiConfigured: boolean;
  geminiConfigured: boolean;
  anthropicConfigured: boolean;
};

export function CredentialPanel({ initial }: { initial: CredentialStatus | null }) {
  const [status, setStatus] = useState(initial);
  const action = useAction();
  const t = useT();
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void api('ai/credentials/status')
        .then((value) => {
          if (active) setStatus(value);
        })
        .catch(() => {});
    };
    refresh();
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(refresh, 30000);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
      window.clearInterval(timer);
    };
  }, []);
  return (
    <Card className="credential-panel">
      <div className="section-heading">
        <h2 className="check">
          <KeyRound size={22} />
          {t('aiKeys')}
        </h2>
        <small>{t('serverOnlyKeys')}</small>
      </div>
      <div className="grid three">
        {(
          [
            ['OpenAI', 'openaiConfigured'],
            ['Google Gemini', 'geminiConfigured'],
            ['Anthropic', 'anthropicConfigured'],
          ] as const
        ).map(([name, key]) => {
          const configured = status?.[key] === true;
          return (
            <div key={key} className={`credential-indicator ${configured ? 'present' : 'absent'}`}>
              <strong>{name} (API Key)</strong>
              <div
                className="credential-mask"
                aria-label={t(configured ? 'configured' : 'unconfigured')}
              >
                {configured ? '•••••' : t('unconfigured')}
              </div>
              <span className="check">
                {configured ? <Check size={17} /> : <AlertTriangle size={17} />}
                {t(configured ? 'keyOnServer' : 'keyMissing')}
              </span>
            </div>
          );
        })}
      </div>
      <p className="muted">{t('keyPresenceHint')}</p>
      <Button
        secondary
        type="button"
        busy={action.busy}
        onClick={() =>
          action.act(async () => {
            setStatus(await api('ai/credentials/status'));
          }, '')
        }
      >
        {t('refreshKeyStatus')}
      </Button>
      <Notice {...action} />
    </Card>
  );
}
