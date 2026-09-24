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
export const QUALITY_MULTIPLIERS = {
  low: 1,
  medium: 3,
  high: 9,
} as const;
export type ImageQuality = keyof typeof QUALITY_MULTIPLIERS;
export const imageQualitySchema = z.enum(['low', 'medium', 'high']);
export const userImageQualitySchema = z.enum(['low', 'medium']);
export const statuses = [
  'DRAFT',
  'ROUTINE',
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
  DRAFT: ['ROUTINE', 'GENERATING', 'AWAITING_REVIEW', 'ARCHIVED'],
  ROUTINE: ['GENERATING', 'APPROVED', 'REJECTED', 'ARCHIVED'],
  GENERATING: ['ROUTINE', 'AWAITING_REVIEW', 'FAILED'],
  AWAITING_REVIEW: ['APPROVED', 'REJECTED', 'GENERATING', 'ARCHIVED'],
  APPROVED: ['SCHEDULED', 'AWAITING_REVIEW', 'ROUTINE', 'ARCHIVED', 'PUBLISHING', 'PUBLISHED'],
  SCHEDULED: ['PUBLISHING', 'APPROVED', 'AWAITING_REVIEW', 'ARCHIVED', 'PUBLISHED'],
  PUBLISHING: ['PUBLISHED', 'FAILED'],
  PUBLISHED: ['ARCHIVED'],
  FAILED: ['ROUTINE', 'GENERATING', 'AWAITING_REVIEW', 'ARCHIVED'],
  REJECTED: ['ROUTINE', 'GENERATING', 'AWAITING_REVIEW', 'ARCHIVED'],
  ARCHIVED: [],
};
export function canTransition(from: Status, to: Status) {
  return transitions[from].includes(to);
}
export function permitted(role: Role, action: 'read' | 'write' | 'admin') {
  return action === 'read' || (action === 'write' && role !== 'VIEWER') || role === 'ADMIN';
}
export const destinations = {
  feed: { id: 'feed', label: 'Feed' },
  stories: { id: 'stories', label: 'Stories' },
  feed_and_stories: { id: 'feed_and_stories', label: 'Feed e Stories' },
} as const;
export type Destination = keyof typeof destinations;
export const destinationSchema = z.enum(['feed', 'stories', 'feed_and_stories']);

export function getChannelDestinations(channel: Channel): Destination[] {
  if (channel === 'instagram' || channel === 'facebook') {
    return ['feed', 'stories', 'feed_and_stories'];
  }
  return ['feed'];
}

export function getChannelsDestinations(selectedChannels: Channel[]): Destination[] {
  const hasStories = selectedChannels.some((c) => c === 'instagram' || c === 'facebook');
  return hasStories ? ['feed', 'stories', 'feed_and_stories'] : ['feed'];
}

export const routineSettingsSchema = z
  .object({
    image_style: z.string().default('Disney / Pixar'),
    instruction: z.string().default(''),
    channels: z.array(channelSchema).default(['instagram']),
    image_quality: z.enum(['low', 'medium', 'high']).default('low'),
    image_count: z.number().int().min(1).max(6).default(1),
    is_carousel: z.boolean().default(false),
    cta: z.string().default(''),
    destination: destinationSchema.default('feed'),
  })
  .default({
    image_style: 'Disney / Pixar',
    instruction: '',
    channels: ['instagram'],
    image_quality: 'low',
    image_count: 1,
    is_carousel: false,
    cta: '',
    destination: 'feed',
  });

export const agentSchema = z.object({
  name: z.string().trim().min(2).max(160),
  briefing: z.record(z.string(), z.unknown()),
  text_settings: z.record(z.string(), z.unknown()),
  visual_settings: z.record(z.string(), z.unknown()),
  channel_settings: z.record(z.string(), z.unknown()).default({}),
  channels: z.array(channelSchema).min(1).max(6),
  content_language: z.string().min(2).max(32),
  mode: z
    .enum(['ASSISTED', 'AUTONOMOUS'])
    .or(z.literal('MANUAL').transform(() => 'ASSISTED' as const)),
  approval_required: z.boolean(),
  research_enabled: z.boolean(),
  image_count: z.number().int().min(0).max(20),
  active: z.boolean(),
  routine_settings: routineSettingsSchema,
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
  created_by?: string | null;
  responsibles?: { id: string; name: string; avatarUrl?: string }[];
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
  status?: Status | null;
  scheduled_at?: string | null;
  published_at?: string | null;
  content_media: Media[];
};
export type Media = {
  id: string;
  position: number;
  version?: number;
  storage_path: string;
  url?: string;
  prompt?: string;
  aspect_ratio?: string;
  provider?: string;
  model?: string;
  created_at?: string;
};
export const assetCategorySchema = z.enum(['reference', 'protected_identity', 'exact_asset']);
export type AssetCategory = z.infer<typeof assetCategorySchema>;

export const identityTypeSchema = z.enum(['genie', 'teacher', 'mascot', 'avatar']);
export type IdentityType = z.infer<typeof identityTypeSchema>;

export const assetSubtypeSchema = z.enum(['logo', 'badge', 'watermark', 'other']);
export type AssetSubtype = z.infer<typeof assetSubtypeSchema>;

export const exactAssetPlacementSchema = z.enum(['top_left', 'top_right', 'bottom_left', 'bottom_right', 'manual']);
export type ExactAssetPlacement = z.infer<typeof exactAssetPlacementSchema>;

export type Asset = {
  id: string;
  name: string;
  category: string;
  mime_type: string;
  storage_path: string;
  size: number;
  tags: string[];
  url?: string;
  content_hash?: string | null;
  processing_status?: 'pending' | 'processing' | 'processed' | 'failed';
  processing_error?: string | null;
  processed_at?: string | null;
  processor_model?: string | null;
  textual_interpretation?: Record<string, unknown> | null;
  summary_text?: string | null;
  identity_name?: string | null;
  identity_type?: IdentityType | string | null;
  is_master?: boolean;
  asset_subtype?: AssetSubtype | string | null;
  placement?: ExactAssetPlacement | string | null;
  scale_percent?: number | null;
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
    if (!selected.includes(v.channel)) {
      throw new Error('invalid_output');
    }
    if (count <= 0) {
      v.image_prompts = [];
    } else {
      if (!Array.isArray(v.image_prompts) || v.image_prompts.length === 0) {
        throw new Error('invalid_output');
      }
      if (v.image_prompts.length > count) {
        v.image_prompts = v.image_prompts.slice(0, count);
      } else if (v.image_prompts.length < count) {
        const last = v.image_prompts[v.image_prompts.length - 1];
        while (v.image_prompts.length < count) {
          v.image_prompts.push(last);
        }
      }
    }
    if (v.caption.length > channels[v.channel].limit) {
      v.caption = fitCaptionToLimit(v.caption, channels[v.channel].limit);
    }
  }
}

export type UserStatus = 'active' | 'inactive' | 'blocked';

export type QuotaAdjustmentLog = {
  id: string;
  created_at: string;
  actor: string;
  admin_email?: string;
  previous_quota_mb: number;
  new_quota_mb: number;
  reason?: string;
};

export type QuotaTransaction = {
  id: string;
  user_id: string;
  workspace_id?: string | null;
  amount: number;
  balance_before: number;
  balance_after: number;
  type: 'ASSIGNMENT' | 'CONSUMPTION' | 'REFUND' | 'ADJUSTMENT';
  description: string;
  reason?: string;
  source?: string;
  actor_id?: string | null;
  admin_email?: string;
  job_id?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
};

export type AdminUserDetail = {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  role: string;
  status: UserStatus;
  created_at: string;
  last_sign_in_at: string | null;
  // Content quota system
  content_quota_balance: number;
  content_quota_total_assigned: number;
  content_quota_total_consumed: number;
  quota_transactions: QuotaTransaction[];
  // Objective usage metrics
  total_generations: number;
  saldo_consumido: number;
  qualities_used: {
    low: number;
    medium: number;
    high: number;
  };
  storage_used_bytes: number;
  storage_quota_mb: number;
  is_unlimited: boolean;
  adjustment_history: QuotaAdjustmentLog[];
};
