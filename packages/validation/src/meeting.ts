import { z } from 'zod';

export const createMeetingSchema = z.object({
  name: z.string().min(1, 'Meeting name is required').max(200, 'Meeting name is too long'),
  scheduled_start_at: z.string().datetime({ message: 'Must be a valid ISO datetime' }),
  scheduled_end_at: z.string().datetime({ message: 'Must be a valid ISO datetime' }),
  grace_minutes: z.number().int().min(0).max(60).optional().default(5),
});

export const updateMeetingSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  scheduled_start_at: z.string().datetime().optional(),
  scheduled_end_at: z.string().datetime().optional(),
  grace_minutes: z.number().int().min(0).max(60).optional(),
});

export const createInviteSchema = z.object({
  expires_at: z.string().datetime({ message: 'Must be a valid ISO datetime' }),
  max_uses: z.number().int().min(1).nullable().optional().default(null),
});

export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;
export type UpdateMeetingInput = z.infer<typeof updateMeetingSchema>;
export type CreateInviteInput = z.infer<typeof createInviteSchema>;
