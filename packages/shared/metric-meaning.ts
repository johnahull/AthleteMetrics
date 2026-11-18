import { z } from 'zod';

/** Max length of the family-facing "meaning" text on a metric. */
export const MAX_METRIC_MEANING_LENGTH = 400;

// Wording a family-facing metric meaning must never carry (mirrors the AI insights NEVER_SAY themes).
// shortcut: keyword scan, not semantic; it catches the obvious wording, not paraphrase. Upgrade if misses show up.
const FORBIDDEN: Array<{ label: string; re: RegExp }> = [
  { label: 'diagnosis wording', re: /\b(diagnos\w*|syndrome|disorder|tendin\w+|deficien\w+|concussion\w*|acl|rehab\w*)\b/i },
  { label: 'injury or pain wording', re: /\b(injur\w*|sprain\w*|strain\w*|tear\w*|fractur\w*|re-?injur\w*|hurt\w*|pain\w*|sore\w*)\b/i },
  { label: 'clearance or return-to-play wording', re: /\b(cleared|clearance|return(s|ed)? to (play|sport)|safe(ly)? to (play|return)|ready to (play|return)|(is|are|be) safe)\b/i },
  { label: 'balance or symmetry reassurance', re: /\b(balanced|well[- ]balanced|symmetr\w* (is|means) (safe|healthy|fine))\b/i },
  { label: 'body weight or composition wording', re: /\b(weigh(s|ed|ing)?|weights?(?! room)|body ?fat|overweight|obes\w*|lean mass|body composition|bmi|pounds?|lbs?|heavier)\b/i },
  { label: 'a predicted time', re: /\b(predict\w*|projected (time|result)|projects? to|on track to (run|clock|jump|hit)|will (run|clock|jump))\b/i },
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

/** Trimmed, length-capped text (empty becomes null). `scan` adds the forbidden-wording check (org-written custom metrics). */
export function metricMeaningSchema(opts: { scan: boolean }) {
  const base = z.string().trim().max(MAX_METRIC_MEANING_LENGTH, `Meaning must be ${MAX_METRIC_MEANING_LENGTH} characters or less`);
  const checked = opts.scan
    ? base.superRefine((v, ctx) => {
        const msg = findMeaningViolation(v);
        if (msg) ctx.addIssue({ code: 'custom', message: msg });
      })
    : base;
  // An empty string means "no meaning": store NULL, never ''
  return checked.transform((v) => v || null);
}
