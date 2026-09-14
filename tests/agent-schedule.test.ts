import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { nextOccurrence } from '@/lib/jobs/scheduling';

describe('agent schedule validation and calculation', () => {
  const scheduleActionSchema = z
    .object({
      id: z.uuid().optional(),
      agent_id: z.uuid().optional(),
      timezone: z.string(),
      local_time: z.string(),
      weekdays: z.array(z.number().int().min(1).max(7)).min(1),
      enabled: z.boolean(),
    })
    .refine((data) => data.agent_id || data.id, { message: 'agent_id or id required' });

  it('accepts payload with id only, agent_id only, or both', () => {
    const agentId = '11111111-1111-4111-8111-111111111111';
    const scheduleId = '22222222-2222-4222-8222-222222222222';

    const payloadWithBoth = {
      action: 'schedule',
      id: scheduleId,
      agent_id: agentId,
      timezone: 'America/Sao_Paulo',
      local_time: '23:30',
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      enabled: true,
    };
    const parsedBoth = scheduleActionSchema.parse(payloadWithBoth);
    expect(parsedBoth.agent_id).toBe(agentId);
    expect(parsedBoth.id).toBe(scheduleId);

    const payloadWithAgentIdOnly = {
      action: 'schedule',
      agent_id: agentId,
      timezone: 'America/Sao_Paulo',
      local_time: '23:30',
      weekdays: [1, 2, 3, 4, 5],
      enabled: true,
    };
    expect(scheduleActionSchema.parse(payloadWithAgentIdOnly).agent_id).toBe(agentId);

    const payloadWithIdOnly = {
      action: 'schedule',
      id: agentId,
      timezone: 'America/Sao_Paulo',
      local_time: '23:30',
      weekdays: [1, 2, 3, 4, 5],
      enabled: true,
    };
    expect(scheduleActionSchema.parse(payloadWithIdOnly).id).toBe(agentId);
  });

  it('correctly calculates next occurrence for 23:30 every day (1..7)', () => {
    const after = new Date('2026-09-13T20:00:00Z'); // Sunday 17:00 in America/Sao_Paulo (UTC-3)
    const next = nextOccurrence('23:30', [1, 2, 3, 4, 5, 6, 7], 'America/Sao_Paulo', after);
    expect(next.toISOString()).toBe('2026-09-14T02:30:00.000Z'); // 23:30 local is 02:30 UTC next day
  });
});
