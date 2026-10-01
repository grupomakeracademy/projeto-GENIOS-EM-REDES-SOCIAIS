'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from './ui';

export function QuotaBadge({
  className = '',
  onClick,
}: {
  className?: string;
  onClick?: () => void;
} = {}) {
  const [balance, setBalance] = useState<number | null>(null);

  const refreshBalance = async () => {
    try {
      const data = await api('quota/balance');
      if (typeof data?.balance === 'number') {
        setBalance(data.balance);
      }
    } catch {
      setBalance((prev) => (prev !== null ? prev : 100));
    }
  };

  useEffect(() => {
    refreshBalance();

    const handleUpdate = (e: Event) => {
      const custom = e as CustomEvent<{ balance?: number }>;
      if (typeof custom.detail?.balance === 'number') {
        setBalance(custom.detail.balance);
      } else {
        refreshBalance();
      }
    };

    window.addEventListener('quota-updated', handleUpdate);
    const interval = setInterval(refreshBalance, 30000);

    return () => {
      window.removeEventListener('quota-updated', handleUpdate);
      clearInterval(interval);
    };
  }, []);

  return (
    <Link
      href="/settings?tab=users"
      className={`topbar-quota-badge ${className}`.trim()}
      title={
        balance !== null
          ? `Saldo disponível: ${balance} cotas de geração de conteúdo`
          : 'Saldo de cotas de geração de conteúdo'
      }
      onClick={onClick}
    >
      <span className="quota-coins-icon" role="img" aria-label="Moedas">
        🪙
      </span>
      <span className="quota-amount">
        <strong>{balance !== null ? balance : '—'}</strong>{' '}
        {balance === 1 ? 'cota' : 'cotas'}
      </span>
    </Link>
  );
}
