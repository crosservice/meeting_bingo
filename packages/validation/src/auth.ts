import { z } from 'zod';

export const nicknameSchema = z
  .string()
  .min(3, 'Nickname must be at least 3 characters')
  .max(30, 'Nickname must be at most 30 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Nickname may only contain letters, numbers, hyphens, and underscores');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const registerSchema = z.object({
  nickname: nicknameSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  nickname: z.string().min(1, 'Nickname is required'),
  password: z.string().min(1, 'Password is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
