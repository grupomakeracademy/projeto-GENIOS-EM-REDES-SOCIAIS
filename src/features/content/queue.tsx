'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCw, CalendarDays } from 'lucide-react';
import { api, Button, Notice, StatusBadge, useAction, useLocale, useT } from '@/components/ui';
import { ContentActionsMenu, ContentNetworks, ContentResponsibles, ContentUserAvatar } from './cards';
export type Run = {
  id: string;
  status: string;
  agentId: string;
  instruction: string;
  channels: string[];
  error: string | null;
  stage: string;
  contentId: string | null;
  scheduledAt: string;
  responsibles?: { id: string; name: string; avatarUrl?: string }[];
};
export function useGenerationRuns(revision: number, agent='') {
  const [runs, setRuns] = useState<Run[]>([]),
    [error, setError] = useState('');
  const router = useRouter(),
    previous = useRef('');
  useEffect(() => {
    let active = true,
      inFlight = false;
    async function refresh() {
      if (inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        const data = await api(`runs${agent?'?agent='+encodeURIComponent(agent):''}`);
        if (!active) return;
        const snapshot = JSON.stringify(data.items);
        if (previous.current && previous.current !== snapshot) router.refresh();
        previous.current = snapshot;
        setRuns(data.items);
        setError('');
      } catch {
        if (active) setError('database_error');
      } finally {
        inFlight = false;
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [revision, router, agent]);
  return { runs, error, setRuns };
}
export function RunCard({
  run,
  canEdit,
  onChange,
  returnTo,
}: {
  run: Run;
  canEdit: boolean;
  onChange: () => void;
  returnTo: string;
}) {
  const t = useT(),
    locale = useLocale(),
    action = useAction();
  return (
    <article className="execution-card execution-run">
      <div className="execution-body">
        <div className="execution-top">
          <StatusBadge status={run.status === 'FAILED' ? 'FAILED' : 'GENERATING'} />
          {canEdit && (
            <ContentActionsMenu
              id={run.id}
              kind="run"
              title={run.instruction || t('newContent')}
              onDeleted={onChange}
            />
          )}
        </div>
        <h3>{run.instruction || t('newContent')}</h3>
        <div className="execution-meta-row">
          <ContentNetworks networks={run.channels} />
        </div>
        <p className="execution-context">
          {run.status === 'PENDING'
            ? t('queuePending')
            : run.status === 'RUNNING'
              ? t(`stage_${run.stage}`)
              : null}
        </p>
        {run.error && (
          <p className="execution-error">
            {t(run.error)} <code>{run.error}</code>
          </p>
        )}
        <div className="execution-footer-row">
          <div className="execution-footer-left">
            <small className="execution-date">
              <CalendarDays size={14} />
              {new Date(run.scheduledAt).toLocaleString(locale)}
            </small>
            {run.contentId && (
              <Link
                className="execution-analyze"
                href={`/contents/${run.contentId}?returnTo=${encodeURIComponent(returnTo)}`}
              >
                Analisar por rede social →
              </Link>
            )}
            {run.status === 'FAILED' && canEdit && (
              <Button
                secondary
                busy={action.busy}
                onClick={() =>
                  void action.act(async () => {
                    await api('runs', 'PATCH', { id: run.id });
                    onChange();
                  }, 'enqueued')
                }
              >
                <RotateCw size={15} />
                {t('retryGeneration')}
              </Button>
            )}
          </div>
          <div className="execution-footer-avatar-wrap">
            <ContentUserAvatar responsible={run.responsibles?.[0]} />
          </div>
        </div>
        <Notice {...action} />
      </div>
    </article>
  );
}
