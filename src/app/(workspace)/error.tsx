'use client';
import { Card, Button, useT } from '@/components/ui';
export default function ErrorBoundary({ reset }: { reset: () => void }) {
  const t = useT();
  return (
    <Card>
      <p role="alert">{t('database_error')}</p>
      <Button onClick={reset}>{t('following')}</Button>
    </Card>
  );
}
