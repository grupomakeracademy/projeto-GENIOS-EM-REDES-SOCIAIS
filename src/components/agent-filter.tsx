'use client';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useT } from './ui';
export function AgentFilter({
  agents,
  value,
  onChange,
  disabled,
}: {
  agents: { id: string; name: string }[];
  value?: string;
  onChange?: (id: string) => void;
  disabled?: boolean;
}) {
  const params = useSearchParams(),
    path = usePathname(),
    router = useRouter(),
    t = useT();
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Agente"
      value={value ?? params.get('agent') ?? ''}
      disabled={disabled || pending}
      style={{ maxWidth: 320 }}
      onChange={(e) => {
        const id = e.target.value;
        if (onChange) return onChange(id);
        const next = new URLSearchParams(params);
        next.delete('page');
        if (id) next.set('agent', id);
        else next.delete('agent');
        start(() => router.push(`${path}?${next}`, { scroll: false }));
      }}
    >
      <option value="">{t('allAgents')}</option>
      {agents.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
}
