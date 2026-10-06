/**
 * Movement Quality Index (MQI) entry: definitions, form schema and pure helpers
 * (AM-FEAT-015 Phase 3). Shared by the event data-entry panel and its tests.
 *
 * Scores are coach-entered 0-3 ordinals per movement pattern. MQI_TOTAL (sum of the 8
 * patterns, 0-24) and MQ_TRANSITION_TOTAL (sum of the 4 transitions, 0-12) are derived
 * server-side; computeMqiTotal / computeTransitionTotal only drive the live preview.
 */
import { z } from "zod";
import { mediaUrlSchema } from "./schema-original";

export const MQI_NOTES_MAX = 1000;

export interface MqiMetricDef {
  code: string;
  label: string;
}

/** The 8 pattern scores that make up MQI_TOTAL */
export const MQI_PATTERNS: readonly MqiMetricDef[] = [
  { code: "MQ_LIN_ACCEL", label: "Linear Acceleration" },
  { code: "MQ_MAX_VELO", label: "Max Velocity" },
  { code: "MQ_DECEL", label: "Deceleration" },
  { code: "MQ_SHUFFLE", label: "Lateral Shuffle" },
  { code: "MQ_LATRUN", label: "Lateral Run (crossover)" },
  { code: "MQ_HIPTURN", label: "Hip Turn" },
  { code: "MQ_BACKPEDAL", label: "Backpedal" },
  { code: "MQ_JUMP", label: "Jump" },
];

/** The 4 optional transition scores (MQ_TRANSITION_TOTAL, never part of MQI_TOTAL) */
export const MQI_TRANSITIONS: readonly MqiMetricDef[] = [
  { code: "MQ_TRANS_DECEL_CUT", label: "Decel → Lateral Cut" },
  { code: "MQ_TRANS_GAS_BRAKE", label: "Gas ↔ Brake" },
  { code: "MQ_TRANS_BACKPEDAL_TURN", label: "Backpedal → Hip Turn → Sprint" },
  { code: "MQ_TRANS_LAT_LINEAR", label: "Lateral → Linear" },
];

export const MQI_RUBRIC = [
  { score: 3, label: "Efficient" },
  { score: 2, label: "Functional" },
  { score: 1, label: "Compensated" },
  { score: 0, label: "Absent" },
] as const;

export const MQI_TOTAL_CODE = "MQI_TOTAL";
export const MQI_TRANSITION_TOTAL_CODE = "MQ_TRANSITION_TOTAL";

const ALL_CODES = [...MQI_PATTERNS, ...MQI_TRANSITIONS].map((m) => m.code);

export type MqiScores = Record<string, number | null | undefined>;

export interface MqiRowValues {
  /** null = not scored (blank) */
  score: number | null;
  /** https clip link; '' = none */
  mediaUrl: string;
  /** hard faults, left/right differences; '' = none */
  notes: string;
}

export interface MqiEntryValues {
  rows: Record<string, MqiRowValues>;
}

const rowSchema = z
  .object({
    score: z
      .number()
      .int("Score must be a whole number")
      .min(0, "Score must be 0-3")
      .max(3, "Score must be 0-3")
      .nullable(),
    mediaUrl: z
      .string()
      .transform((s) => s.trim())
      .superRefine((s, ctx) => {
        const parsed = mediaUrlSchema.safeParse(s);
        if (!parsed.success) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: parsed.error.issues[0]?.message ?? "Clip link must be a public HTTPS URL",
          });
        }
      }),
    notes: z.string().max(MQI_NOTES_MAX, `Notes cannot exceed ${MQI_NOTES_MAX} characters`),
  })
  .superRefine((row, ctx) => {
    if (row.score === null && (row.mediaUrl !== "" || row.notes.trim() !== "")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["score"],
        message: "Choose a score before adding a clip link or note",
      });
    }
  });

export const mqiEntrySchema = z.object({
  rows: z.object(Object.fromEntries(ALL_CODES.map((code) => [code, rowSchema])) as Record<string, typeof rowSchema>),
});

export function emptyMqiEntry(): MqiEntryValues {
  return {
    rows: Object.fromEntries(ALL_CODES.map((code) => [code, { score: null, mediaUrl: "", notes: "" }])),
  };
}

function sumAll(defs: readonly MqiMetricDef[], scores: MqiScores): number | null {
  let total = 0;
  for (const { code } of defs) {
    const s = scores[code];
    if (s === null || s === undefined) return null;
    total += s;
  }
  return total;
}

/** Sum of the 8 pattern scores, or null ("incomplete") unless all 8 are set. 0 counts as set. */
export function computeMqiTotal(scores: MqiScores): number | null {
  return sumAll(MQI_PATTERNS, scores);
}

/** Sum of the 4 transition scores, or null unless all 4 are set. */
export function computeTransitionTotal(scores: MqiScores): number | null {
  return sumAll(MQI_TRANSITIONS, scores);
}

/** Previously saved row (from the event's existing measurements) */
export interface MqiSavedRow {
  id: string;
  score: number;
  mediaUrl: string | null;
  notes: string | null;
}

export interface MqiWrite {
  userId: string;
  metric: string;
  value: number;
  date: string;
  notes: string;
  mediaUrl: string | null;
}

/**
 * Compute the writes needed to bring the saved rows to the entered values:
 * changed or new scores are upserted (the API edits an existing MQ score in place),
 * saved scores that were blanked are deleted. Unchanged rows produce nothing.
 */
export function diffMqiEntry(
  userId: string,
  values: MqiEntryValues,
  saved: Record<string, MqiSavedRow | undefined>,
  date: string,
): { upserts: MqiWrite[]; deletes: string[] } {
  const upserts: MqiWrite[] = [];
  const deletes: string[] = [];

  for (const code of ALL_CODES) {
    const row = values.rows[code];
    const prev = saved[code];
    if (!row) continue;

    if (row.score === null) {
      if (prev) deletes.push(prev.id);
      continue;
    }

    const mediaUrl = row.mediaUrl.trim() === "" ? null : row.mediaUrl.trim();
    const notes = row.notes;
    const unchanged =
      prev !== undefined &&
      prev.score === row.score &&
      (prev.mediaUrl ?? null) === mediaUrl &&
      (prev.notes ?? "") === notes;
    if (unchanged) continue;

    upserts.push({ userId, metric: code, value: row.score, date, notes, mediaUrl });
  }

  return { upserts, deletes };
}
