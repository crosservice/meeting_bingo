import { z } from 'zod';

export const createPhraseSetSchema = z.object({
  name: z.string().min(1, 'Phrase set name is required').max(200),
});

export const createPhraseSchema = z.object({
  text: z.string().min(1, 'Phrase text is required').max(500),
});

export const updatePhraseSchema = z.object({
  text: z.string().min(1).max(500).optional(),
  is_active: z.boolean().optional(),
});

export type CreatePhraseSetInput = z.infer<typeof createPhraseSetSchema>;
export type CreatePhraseInput = z.infer<typeof createPhraseSchema>;
export type UpdatePhraseInput = z.infer<typeof updatePhraseSchema>;
