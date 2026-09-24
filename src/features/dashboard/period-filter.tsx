'use client';
import { useRouter, useSearchParams } from 'next/navigation';
export function PeriodFilter({ from, to, todayISO }: { from: string; to: string; todayISO: string }) {
 const router = useRouter(), params = useSearchParams();
 return <form className="dashboard-period-filter" onSubmit={e => {
 e.preventDefault(); const data = new FormData(e.currentTarget), p = new URLSearchParams(params);
 p.set('from', String(data.get('from'))); p.set('to', String(data.get('to'))); router.push('/dashboard?'+p);
 }}><select aria-label="Período" defaultValue="custom" onChange={e => {
   if (e.target.value === 'custom') return;
   const today = new Date(todayISO + 'T12:00:00'), start = new Date(today);
   start.setDate(start.getDate() - Number(e.target.value) + 1);
   const p = new URLSearchParams(params);
   p.set('from', [start.getFullYear(),String(start.getMonth()+1).padStart(2,'0'),String(start.getDate()).padStart(2,'0')].join('-'));
   p.set('to', todayISO); router.push('/dashboard?'+p);
 }}><option value="custom">Período personalizado</option><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option></select><label>De <input type="date" name="from" defaultValue={from} required /></label>
 <label>Até <input type="date" name="to" defaultValue={to} required /></label><button className="button secondary" type="submit">Aplicar período</button></form>;
}
