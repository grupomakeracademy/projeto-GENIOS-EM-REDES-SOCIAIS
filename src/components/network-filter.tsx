'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { channels, type Channel } from '@/lib/domain';
import { parseNetworks } from '@/lib/network-filter';

export function NetworkFilter({ available }: { available: Channel[] }) {
  const params = useSearchParams(), router = useRouter(), pathname = usePathname();
  const selected = parseNetworks(params.get('network'));
  function change(next: Channel[]) {
    const p = new URLSearchParams(params);
    p.delete('page');
    if (next.length) p.set('network', next.join(',')); else p.delete('network');
    router.push(`${pathname}?${p}`, { scroll: false });
  }
  return <details className="network-filter">
    <summary aria-label="Filtrar redes sociais">{selected.length ? selected.map(c => channels[c].name).join(' + ') : 'Todas as redes'}</summary>
    <div className="network-filter-options">
      <label><input type="checkbox" checked={!selected.length} onChange={() => change([])} />Todas as redes</label>
      {available.map(c => <label key={c}><input type="checkbox" checked={selected.includes(c)} onChange={() => change(selected.includes(c) ? selected.filter(v => v !== c) : [...selected, c])} />{channels[c].name}</label>)}
    </div>
  </details>;
}
