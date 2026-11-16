import { z } from "zod";
import { isRealDate } from "./coach-notes";
import { stripControlChars } from "./eval-report-config";

/**
 * Athlete coaching notes (AM-FEAT-025): a dated, organization-scoped log a coach keeps about an athlete.
 * organizationId is not in the body of an update (a note never moves) and is a separate field on create.
 */
export const ATHLETE_NOTE_CATEGORIES = ["technique", "effort", "readiness", "injury", "mindset", "goal", "other"] as const;
export const ATHLETE_NOTE_BODY_MAX = 4000;

const fields = {
  body: z.string().transform(stripControlChars).pipe(z.string().min(1).max(ATHLETE_NOTE_BODY_MAX)),
  // No server default: the client sends the coach's local date. Past dates are allowed.
  observedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealDate, "Invalid date"),
  category: z.enum(ATHLETE_NOTE_CATEGORIES).nullable().optional(),
  flagged: z.boolean().optional(),
  eventId: z.string().uuid().nullable().optional(),
};

export const athleteNoteInputSchema = z.object(fields).strict();

export const athleteNoteCreateSchema = z.object({ ...fields, organizationId: z.string().uuid() }).strict();

export const athleteNoteUpdateSchema = z.object(fields).partial().strict()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export type AthleteNoteInput = z.infer<typeof athleteNoteInputSchema>;
export type AthleteNoteCategory = typeof ATHLETE_NOTE_CATEGORIES[number];
