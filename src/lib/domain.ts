import { z } from 'zod';
export const channels = {
  instagram: { name: 'Instagram', ratio: '4:5', limit: 2200, color: '#cb319d' },
  facebook: { name: 'Facebook', ratio: '4:5', limit: 63206, color: '#1877f2' },
  whatsapp: { name: 'WhatsApp', ratio: '9:16', limit: 4096, color: '#078c55' },
  tiktok: { name: 'TikTok', ratio: '9:16', limit: 2200, color: '#172234' },
  x: { name: 'X', ratio: '16:9', limit: 280, color: '#172234' },
  linkedin: { name: 'LinkedIn', ratio: '4:5', limit: 3000, color: '#0a66c2' },
} as const;
export type Channel = keyof typeof channels;
export const channelSchema = z.enum([
  'instagram',
  'facebook',
  'whatsapp',
  'tiktok',
  'x',
  'linkedin',
]);
export const statuses = [
  'DRAFT',
  'GENERATING',
  'AWAITING_REVIEW',
  'APPROVED',
  'SCHEDULED',
  'PUBLISHING',
  'PUBLISHED',
  'FAILED',
  'REJECTED',
  'ARCHIVED',
] as const;
export type Status = (typeof statuses)[number];
export type Role = 'ADMIN' | 'EDITOR' | 'VIEWER';
export const transitions: Record<Status, Status[]> = {
  DRAFT: ['GENERATING', 'AWAITING_REVIEW', 'ARCHIVED'],
  GENERATING: ['AWAITING_REVIEW', 'FAILED'],
  AWAITING_REVIEW: ['APPROVED', 'REJECTED', 'GENERATING', 'ARCHIVED'],
  APPROVED: ['SCHEDULED', 'AWAITING_REVIEW', 'ARCHIVED'],
  SCHEDULED: ['PUBLISHING', 'APPROVED', 'AWAITING_REVIEW', 'ARCHIVED'],
  PUBLISHING: ['PUBLISHED', 'FAILED'],
  PUBLISHED: ['ARCHIVED'],
  FAILED: ['GENERATING', 'AWAITING_REVIEW', 'ARCHIVED'],
  REJECTED: ['GENERATING', 'AWAITING_REVIEW', 'ARCHIVED'],
  ARCHIVED: [],
};
export function canTransition(from: Status, to: Status) {
  return transitions[from].includes(to);
}
export function permitted(role: Role, action: 'read' | 'write' | 'admin') {
  return action === 'read' || (action === 'write' && role !== 'VIEWER') || role === 'ADMIN';
}
export const agentSchema = z.object({
  name: z.string().trim().min(2).max(160),
  briefing: z.record(z.string(), z.unknown()),
  text_settings: z.record(z.string(), z.unknown()),
  visual_settings: z.record(z.string(), z.unknown()),
  channel_settings: z.record(z.string(), z.unknown()).default({}),
  channels: z.array(channelSchema).min(1).max(6),
  content_language: z.string().min(2).max(32),
  mode: z.enum(['MANUAL', 'ASSISTED', 'AUTONOMOUS']),
  approval_required: z.boolean(),
  research_enabled: z.boolean(),
  image_count: z.number().int().min(0).max(20),
  active: z.boolean(),
});
export type Agent = z.infer<typeof agentSchema> & { id: string; workspace_id: string };
export const strategySchema = z.object({
  topic: z.string().min(3),
  objective: z.string(),
  audience_pain: z.string(),
  core_message: z.string(),
  angle: z.string(),
  hook: z.string(),
  value_proposition: z.string(),
  cta: z.string(),
  source_references: z.array(z.object({ title: z.string(), url: z.url() })),
});
export const variantSchema = z.object({
  channel: channelSchema,
  title: z.string(),
  caption: z.string().min(1),
  hashtags: z.array(z.string()),
  cta: z.string(),
  visual_concept: z.string(),
  image_prompts: z.array(z.string().min(3)),
});
export const variantsSchema = z.object({ variants: z.array(variantSchema).min(1).max(6) });
export type Content = {
  id: string;
  workspace_id: string;
  agent_id: string;
  topic: string;
  status: Status;
  version: number;
  scheduled_at: string | null;
  created_at: string;
  strategy: Record<string, unknown>;
  content_variants: Variant[];
};
export type Variant = z.infer<typeof variantSchema> & {
  id: string;
  aspect_ratio: string;
  content_media: Media[];
};
export type Media = { id: string; position: number; storage_path: string; url?: string };
export type Asset = {
  id: string;
  name: string;
  category: string;
  mime_type: string;
  storage_path: string;
  size: number;
  tags: string[];
  url?: string;
};
export const providerSchema = z.enum(['openai', 'anthropic', 'google']);
export type ProviderId = z.infer<typeof providerSchema>;
export const configSchema = z
  .object({
    purpose: z.enum(['orchestrator', 'text', 'image', 'embedding']),
    provider: providerSchema,
    model: z
      .string()
      .regex(/^[a-zA-Z0-9._:/-]+$/)
      .max(160),
  })
  .superRefine((v, ctx) => {
    if (v.provider === 'anthropic' && (v.purpose === 'image' || v.purpose === 'embedding'))
      ctx.addIssue({ code: 'custom', message: 'unsupported_capability' });
  });
export type AIConfig = z.infer<typeof configSchema>;
export function fitCaptionToLimit(caption: string, limit: number): string {
  if (caption.length <= limit) return caption;
  let text = caption;
  // If it has trailing hashtags, progressively strip the last hashtag
  while (text.length > limit && text.includes('#')) {
    const lastHash = text.lastIndexOf('#');
    const before = text.slice(0, lastHash).trimEnd();
    if (!before) break;
    text = before;
  }
  if (text.length <= limit) return text;
  // If still over limit, truncate cleanly at word boundary
  const target = limit - 3;
  if (target <= 0) return text.slice(0, limit);
  const truncated = text.slice(0, target);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > target * 0.7) {
    return truncated.slice(0, lastSpace).trimEnd() + '...';
  }
  return truncated.trimEnd() + '...';
}

export function validateVariants(
  variants: z.infer<typeof variantSchema>[],
  selected: Channel[],
  count: number,
) {
  if (
    variants.length !== selected.length ||
    new Set(variants.map((v) => v.channel)).size !== selected.length
  )
    throw new Error('invalid_output');
  for (const v of variants) {
    if (!selected.includes(v.channel) || v.image_prompts.length !== count) {
      throw new Error('invalid_output');
    }
    if (v.caption.length > channels[v.channel].limit) {
      v.caption = fitCaptionToLimit(v.caption, channels[v.channel].limit);
    }
  }
}

