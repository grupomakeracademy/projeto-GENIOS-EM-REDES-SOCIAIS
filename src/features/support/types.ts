export const categories = {
  dashboard: 'Dashboard',
  conteudos: 'Conteúdos',
  calendario: 'Calendário',
  agentes: 'Agentes',
  canais: 'Canais e Integrações',
  biblioteca: 'Biblioteca',
  inteligencia_artificial: 'Inteligência Artificial',
  credenciais_ia: 'Credenciais de IA',
  publicacao: 'Publicação e Agendamento',
  conta_acesso: 'Conta e Acesso',
  configuracoes: 'Configurações',
  erro_tecnico: 'Erro Técnico',
  outros: 'Outros Assuntos',
} as const;
export const statuses = {
  aberto: 'Aberto',
  em_andamento: 'Em andamento',
  respondido: 'Respondido',
  fechado: 'Fechado',
} as const;
export const priorities = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta' } as const;
export type Ticket = {
  id: string;
  workspace_id: string;
  title: string;
  category: keyof typeof categories;
  priority: keyof typeof priorities;
  status: keyof typeof statuses;
  ticket_type: 'support' | 'announcement';
  target_type: 'geral' | 'individual' | null;
  created_by: string;
  author_name: string;
  author_email: string;
  created_at: string;
  updated_at: string;
  assigned_admin_id: string | null;
  assigned_admin_name?: string | null;
  unread: boolean;
};
export type Attachment = {
  id: string;
  original_name: string;
  size: number;
  message_id: string;
  mime_type?: string;
};
export type Message = {
  id: string;
  message: string;
  author_name: string;
  author_role: string;
  user_id: string;
  is_admin_reply: boolean;
  created_at: string;
};
export type TicketDetail = {
  ticket: Ticket;
  messages: Message[];
  attachments: Attachment[];
  events: {
    id: string;
    event_type: string;
    created_at: string;
    metadata: Record<string, string>;
  }[];
};
export type SupportList = { items: Ticket[]; total: number; stats: Record<string, number> };
