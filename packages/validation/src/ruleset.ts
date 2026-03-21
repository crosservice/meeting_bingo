import { z } from 'zod';

export const createRulesetSchema = z.object({
  name: z.string().min(1).max(200).optional().default('Default'),
  board_rows: z.literal(5),
  board_cols: z.literal(5),
  free_square_enabled: z.boolean().optional().default(true),
  free_square_label: z.string().max(50).optional().default('FREE'),
  horizontal_enabled: z.boolean().optional().default(true),
  vertical_enabled: z.boolean().optional().default(true),
  diagonal_enabled: z.boolean().optional().default(true),
  late_join_enabled: z.boolean().optional().default(true),
});

export const updateRulesetSchema = createRulesetSchema.partial();

export type CreateRulesetInput = z.infer<typeof createRulesetSchema>;
export type UpdateRulesetInput = z.infer<typeof updateRulesetSchema>;
