import { z } from 'zod';

/** Max length of the family-facing "meaning" text on a metric. */
export const MAX_METRIC_MEANING_LENGTH = 400;

// Wording a family-facing metric meaning must never carry (mirrors the AI insights NEVER_SAY themes).
// shortcut: keyword scan, not semantic; it catches the obvious wording, not paraphrase. Upgrade if misses show up.
const FORBIDDEN: Array<{ label: string; re: RegExp }> = [
  { label: 'diagnosis wording', re: /\b(diagnos\w*|syndrome|disorder|tendin\w+|deficien\w+)\b/i },
  { label: 'injury wording', re: /\b(injur\w*|sprain\w*|strain\w*|tear\w*|fractur\w*|re-?injur\w*)\b/i },
  { label: 'clearance or return-to-play wording', re: /\b(cleared?|return[- ]to[- ](play|sport)|safe to (play|return)|ready (to|for)\b)/i },
  { label: 'body weight or composition wording', re: /\b(weigh\w*|body ?fat|overweight|obes\w*|lean mass|body composition)\b/i },
  { label: 'a predicted time', re: /\b(predict\w*|projected (time|result)|will (run|clock|jump))\b/i },
];

/** Returns a message naming the first forbidden theme found in `text`, or null when it is clean. */
export function findMeaningViolation(text: string): string | null {
  for (const { label, re } of FORBIDDEN) {
    if (re.test(text)) {
      return `Meaning text must not contain ${label}. Write plain parent-friendly words about what the result says, with no medical or predictive claims.`;
    }
  }
  return null;
}

/** Trimmed, length-capped text. `scan` adds the forbidden-wording check (org-written custom metrics). */
export function metricMeaningSchema(opts: { scan: boolean }) {
  const base = z.string().trim().max(MAX_METRIC_MEANING_LENGTH, `Meaning must be ${MAX_METRIC_MEANING_LENGTH} characters or less`);
  return opts.scan
    ? base.superRefine((v, ctx) => {
        const msg = findMeaningViolation(v);
        if (msg) ctx.addIssue({ code: 'custom', message: msg });
      })
    : base;
}
