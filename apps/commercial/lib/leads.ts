import { z } from 'zod';
export const employeeRanges = ['Somente eu', '2 a 5', '6 a 10', '11 a 20', '21 a 50', '51 a 100', 'Mais de 100'] as const;
export const difficulties = ['Falta de tempo', 'Falta de constância', 'Dificuldade para ter ideias', 'Dificuldade com design', 'Dificuldade para produzir textos', 'Falta de estratégia', 'Conteúdo sem resultado comercial', 'Equipe sobrecarregada', 'Dificuldade para manter identidade'] as const;
export function phoneDigits(value: string) { return value.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''); }
export function maskPhone(value: string) {
  const d = phoneDigits(value).slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  const cut = d.length > 10 ? 7 : 6;
  return `(${d.slice(0, 2)}) ${d.slice(2, cut)}${d.length > cut ? '-' + d.slice(cut) : ''}`;
}
export const leadSchema = z.object({
  requestId: z.uuid(),
  company: z.string().trim().min(2).max(120),
  email: z.email().max(254).transform(v => v.toLowerCase()),
  whatsapp: z.string().transform(phoneDigits).refine(v => /^[1-9][1-9](?:[2-5]\d{7}|9\d{8})$/.test(v), 'Informe um telefone brasileiro com DDD válido.'),
  sector: z.string().trim().min(2).max(50),
  employees: z.enum(employeeRanges),
  marketing: z.enum(['Sim', 'Não']),
  team: z.enum(['Sim', 'Não', 'Profissional terceirizado']),
  difficulty: z.enum(difficulties),
  consent: z.literal(true),
  website: z.string().max(0),
}).strict();
export type Lead = z.infer<typeof leadSchema>;
export function whatsappUrl(lead: Lead, number = '5519988788759') {
  const text = ['Olá! Conheci o Gênio em Redes Sociais pelo site.', '', `Empresa: ${lead.company}`, `E-mail: ${lead.email}`, `WhatsApp: ${maskPhone(lead.whatsapp)}`, `Ramo: ${lead.sector}`, `Funcionários: ${lead.employees}`, `Investe ou já investiu em marketing: ${lead.marketing}`, `Social Media/equipe interna: ${lead.team}`, `Principal dificuldade: ${lead.difficulty}`].join('\n');
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
