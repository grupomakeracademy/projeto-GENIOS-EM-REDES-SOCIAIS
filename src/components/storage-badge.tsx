'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { HardDrive } from 'lucide-react';
import { api } from './ui';

export type StorageUsage = { usedBytes: number; quotaMB: number; isUnlimited: boolean };
export function storageLabel(usage: StorageUsage) {
  const number = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const mb = usage.usedBytes / 1048576;
  const used = mb >= 1024 ? `${number(mb / 1024)} GB` : `${number(mb)} MB`;
  if (usage.isUnlimited) return `${used} de ilimitado`;
  const total = usage.quotaMB >= 1024 ? `${number(usage.quotaMB / 1024)} GB` : `${number(usage.quotaMB)} MB`;
  const percent = usage.quotaMB > 0 ? mb / usage.quotaMB * 100 : mb > 0 ? 100 : 0;
  return `${used} de ${total} (${number(percent)}%)`;
}

export function StorageBadge() {
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  useEffect(() => {
    let active = true;
    let pending = false;
    const refresh = async () => {
      if (pending || document.visibilityState === 'hidden') return;
      pending = true;
      try {
        const value = await api('assets/quota?summary=1');
        if (active) setUsage(value);
      } catch { /* Keep the last confirmed value during a temporary connection failure. */ }
      finally { pending = false; }
    };
    void refresh();
    const interval = window.setInterval(refresh, 15000);
    window.addEventListener('storage-updated', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener('storage-updated', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return <Link href="/library" className="topbar-storage-badge" title="Armazenamento total da conta" aria-label={usage ? `Armazenamento total da conta: ${storageLabel(usage)}` : 'Carregando armazenamento total da conta'}>
    <HardDrive size={16} aria-hidden="true" />
    <span>{usage ? storageLabel(usage) : 'Armazenamento…'}</span>
  </Link>;
}
