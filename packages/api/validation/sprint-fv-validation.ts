import { z } from 'zod';

export const generateSprintFvProfileSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format'),
  eventId: z.string().optional(),
  bodyMassKgOverride: z.number().positive().max(500).optional(),
  notes: z.string().max(1000).optional(),
});

export const sprintFvProfileQuerySchema = z.object({
  userId: z.string().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type GenerateSprintFvProfileInput = z.infer<typeof generateSprintFvProfileSchema>;
export type SprintFvProfileQuery = z.infer<typeof sprintFvProfileQuerySchema>;
