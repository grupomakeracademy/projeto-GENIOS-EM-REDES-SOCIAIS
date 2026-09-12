'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, Button, Card, Notice, useAction, useT } from '@/components/ui';
type Run = {
  id: string;
  status: string;
  agentId: string;
  instruction: string;
  channels: string[];
  error: string | null;
  stage: string;
  contentId: string | null;
};
export function GenerationQueue({
  status,
  agent,
  network,
  canEdit,
  revision,
}: {
  status: string;
  agent: string;
  network: string;
  canEdit: boolean;
  revision: number;
}) {
  const [runs, setRuns] = useState<Run[]>([]),
    [error, setError] = useState('');
  const t = useT(),
    router = useRouter(),
    action = useAction(),
    previous = useRef('');
  useEffect(() => {
    let active = true,
      inFlight = false;
    async function refresh() {
      if (inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        const data = await api('runs');
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
    const visible = () => void refresh();
    document.addEventListener('visibilitychange', visible);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [revision, router]);
  const visible = runs.filter(
    (run) =>
      (!agent || run.agentId === agent) &&
      (!network || !run.channels.length || run.channels.includes(network)) &&
      (!status ||
        (status === 'GENERATING'
          ? run.status !== 'FAILED'
          : status === 'FAILED' && run.status === 'FAILED')),
  );
  return (
    <section aria-live="polite">
      <Notice message={error} error />
      {visible.length > 0 && (
        <Card>
          <h2>{t('generationQueue')}</h2>
          {visible.map((run) => (
            <div
              key={run.id}
              style={{ padding: '16px 0', borderBottom: '1px solid var(--border)' }}
            >
              <h3>{run.instruction || t('newContent')}</h3>
              <p>
                {t(
                  run.status === 'FAILED'
                    ? 'FAILED'
                    : run.status === 'PENDING'
                      ? 'queuePending'
                      : 'GENERATING',
                )}
                {run.status === 'RUNNING' && ` · ${t(`stage_${run.stage}`)}`}
              </p>
              {run.error && <p className="muted">{t(run.error)}</p>}
              {run.contentId && <Link href={`/contents/${run.contentId}`}>{t('viewContent')}</Link>}
              {run.status === 'FAILED' && canEdit && (
                <Button
                  secondary
                  busy={action.busy}
                  onClick={() =>
                    void action.act(async () => {
                      await api('runs', 'PATCH', { id: run.id });
                      setRuns((current) =>
                        current.map((item) =>
                          item.id === run.id ? { ...item, status: 'PENDING', error: null } : item,
                        ),
                      );
                      router.refresh();
                    }, 'enqueued')
                  }
                >
                  {t('retryGeneration')}
                </Button>
              )}
            </div>
          ))}
          <Notice {...action} />
        </Card>
      )}
    </section>
  );
}
