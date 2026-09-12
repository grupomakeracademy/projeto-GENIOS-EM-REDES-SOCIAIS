'use client';
import { Card, useT } from '@/components/ui';
export function Support() {
  const t = useT();
  return (
    <>
      <div className="page-heading">
        <h1>{t('support')}</h1>
      </div>
      <Card>
        <h2>{t('faq')}</h2>
        {['Approval', 'AI'].map((key) => (
          <details key={key} className="list-row" style={{ display: 'block' }}>
            <summary>{t(`faq${key}`)}</summary>
            <p className="muted" style={{ marginTop: 15 }}>
              {t(`faq${key}Answer`)}
            </p>
          </details>
        ))}
      </Card>
    </>
  );
}
