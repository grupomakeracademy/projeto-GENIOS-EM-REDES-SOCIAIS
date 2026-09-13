import { z } from 'zod';
import { channelSchema } from '@/lib/domain';
export const newAgentBriefing = z.object({
  company: z.string().trim().min(2).max(500),
  agentName: z.string().trim().min(2).max(160),
  product: z.string().trim().min(3).max(10000),
  audience: z.string().trim().min(3).max(10000),
  positioning: z.string().trim().min(3).max(10000),
  goals: z.string().trim().min(3).max(10000),
  communication: z.string().trim().min(3).max(10000),
  visual: z.string().trim().min(3).max(10000),
  channels: z.array(channelSchema).min(1).max(6),
  timezone: z.string().min(3),
  local_time: z.string().regex(/^\d{2}:\d{2}$/),
  weekdays: z.array(z.number().int().min(1).max(7)).min(1),
  enabled: z.boolean(),
  approval_required: z.boolean(),
});
