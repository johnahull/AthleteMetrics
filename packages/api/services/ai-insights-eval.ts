/**
 * Output checks for AI coaching insights (eval harness). Pure functions, no network.
 *
 * Used by the unit tests on recorded sample outputs and by scripts/eval-ai-insights.ts on live
 * outputs. They catch the failures that matter most for a shared report: numbers or training
 * prescriptions the model made up, athlete names in a team report, comments on unmeasured
 * qualities, medical wording, an unfilled {{placeholder}}, the athlete's name in the prompt, change over time claimed without history, wrong headings (the web card and PDF expect
 * fixed sections) and length outside the range the prompt asks for. Family texts (parent, athlete) also get the meaning checks: bare numbers,
 * never-say wording, every below-average result named, 2-3 focus results.
 */

import {
  buildPrompt,
  hasGoals,
  insightHeadings,
  insightWordRange,
  isLimitedData,
  type ReportData,
} from "./ai-insights-service";
import type { AIPromptOverrides } from "@shared/ai-prompt-overrides";

// A minus sign only at the start or after a space or "(", so "5-10-5" and "1.18-1.51" stay positive.
// A thousands separator ("1,200") is part of the number.
const NUMBER = /(?:(?<=^|[\s(])-)?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g;
const toNumber = (n: string) => Number(n.replace(/,/g, ""));

/** The fenced report data of a prompt (the whole text when there is no fence). */
function reportDataOf(prompt: string): string {
  const open = prompt.indexOf("<report_data>");
  const close = prompt.indexOf("</report_data>");
  return open >= 0 && close > open ? prompt.slice(open, close) : prompt;
}

/**
 * Numbers in the output whose value is not in the report data of the prompt (instructions such as
 * "150-250 words" do not count). 1.5 matches 1.50; a positive number matches a value of either sign
 * ("0.07 s faster" for "-0.07"), a negative one only the same negative value.
 */
export function ungroundedNumbers(output: string, prompt: string): string[] {
  const values = (reportDataOf(prompt).match(NUMBER) ?? []).map(toNumber);
  const exact = new Set(values);
  const magnitudes = new Set(values.map(Math.abs));
  return (output.match(NUMBER) ?? []).filter((n) => {
    const v = toNumber(n);
    return v < 0 ? !exact.has(v) : !magnitudes.has(v);
  });
}

/** Sets, reps, distances per rep and durations: training prescriptions, which no report data grounds. */
export function prescriptionNumbers(output: string): string[] {
  return output.match(/\b\d+\s*(?:x\s*\d+|sets?\b|reps?\b|minutes?\b|mins?\b|weeks?\b|days?\b)/gi) ?? [];
}

/** Comments on effort, attitude and other qualities the data does not measure. */
export function unmeasuredQualities(output: string): string[] {
  return output.match(/\b(?:effort|attitude|coachab\w*|works? hard|lazy|motivat\w*)\b/gi) ?? [];
}

/**
 * Diagnosis, return-to-play, injury-risk, body-weight and nutrition wording: the system prompt forbids all of it.
 * Checked on every eval run because the editable coaching philosophy could weaken that rule.
 */
export function medicalWords(output: string): string[] {
  const pattern = /\b(?:diagnos\w*|return[- ]to[- ](?:play|sport|competition)|injury[- ]risk|risk of (?:re-?)?injury|body[- ]weight|(?:lose|gain|losing|gaining) weight|weight (?:loss|gain)|nutrition\w*|diet\w*|calorie\w*)\b/gi;
  const found = (output.match(pattern) ?? []).map((w) => w.toLowerCase().replace(/-/g, " ").replace(/^diagnos\w*$/, "diagnosis"));
  return [...new Set(found)];
}

/**
 * Claims that a change happened (only allowed when the report has history): past-tense forms and
 * "since (the) last". Other forms such as "improve", "improving" or "a decline in" also appear in
 * legitimate training advice, so they are not flagged.
 */
function changeWords(output: string): string[] {
  const pattern = /\b(?:improved|declined|since (?:the )?last|increased|decreased|dropped|regressed|grew|rose|fell|gained|lost|slowed|worsened|dipped)\b/gi;
  return [...new Set(output.match(pattern) ?? [])];
}

/** Names (or name parts of 3+ letters) that appear in the output as whole words, ignoring case. */
export function athleteNamesIn(output: string, names: string[]): string[] {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return names.filter((name) =>
    [name, ...name.split(/\s+/).filter((part) => part.length >= 3)].some((part) =>
      new RegExp(`(?<![\\p{L}\\d])${escape(part)}(?![\\p{L}\\d])`, "iu").test(output),
    ),
  );
}

/** Problems with the "## " heading lines against the audience headings: missing, extra, order. */
export function headingIssues(output: string, audience: NonNullable<ReportData["audience"]>, withGoals = false): string[] {
  const expected = insightHeadings(audience, withGoals);
  // "Path to Goal" is optional: the model may fold a thin goal section into What to Work On
  const optional: string[] = expected.filter((h) => h === "Path to Goal");
  const found = output
    .replace(/’/g, "'")
    .split("\n")
    .map((line) => line.match(/^##\s+(.*?)\s*$/)?.[1].replace(/\*\*/g, "").replace(/:$/, "").trim())
    .filter((h): h is string => !!h);
  const issues: string[] = [];
  const missing = expected.filter((h) => !found.includes(h) && !optional.includes(h));
  const extra = found.filter((h) => !expected.includes(h));
  if (missing.length > 0) issues.push(`missing headings: ${missing.join(", ")}`);
  if (extra.length > 0) issues.push(`extra headings: ${extra.join(", ")}`);
  const present = found.filter((h) => expected.includes(h));
  if (present.join("\n") !== expected.filter((h) => present.includes(h)).join("\n")) issues.push("headings out of order");
  return issues;
}

/** Words with at least one letter or digit, so markdown symbols do not count. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w)).length;
}

const sentencesOf = (output: string) =>
  output
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.replace(/^\s*(?:[-*]|\d+[.)])\s+/, '').replace(/\*\*/g, '').trim())
    .filter((s) => s !== '' && !s.startsWith('#'));

/**
 * Sentences that state a number without saying what it means (family text: "a number always comes with its meaning").
 * Heuristic: a sentence with a digit and fewer than 7 words of 3+ letters is mostly the number, e.g. "40-yard dash: 5.26 s".
 */
export function bareNumberSentences(output: string): string[] {
  return sentencesOf(output).filter((s) => /\d/.test(s) && (s.match(/\p{L}{3,}/gu) ?? []).length < 7);
}

const EXERCISE_NOUNS = /\b(?<!paused[- ])squats?\b(?![- ]jump)|\b(?:lunges?|deadlifts?|sled (?:pushes|sprints|work)|box jumps?|depth jumps?|hip thrusts?|nordics?|wall drills?)\b/i;
const SYMMETRY_CLAIM = /\b(?:left|right|legs?|hops?)\b.*\b(?:balanced|safe|ready|cleared)\b|\b(?:balanced|safe|ready|cleared)\b.*\b(?:left|right|legs?|hops?)\b/i;

/** Wording the family rules NEVER SAY list forbids (ai-insights-meaning.ts): returns what matched, lower case. */
export function neverSayHits(output: string): string[] {
  const hits = [...medicalWords(output)];
  const find = (re: RegExp, label: string) => sentencesOf(output).some((s) => re.test(s)) && hits.push(label);
  find(/\bcleared\b/i, 'cleared');
  find(/\b(?:will run|should run|on track to run|predict\w*|projected)\b/i, 'predicted time');
  find(/\b(?:body[- ]?fat|body composition|weigh\w*|pounds|lbs?)\b/i, 'body weight or composition');
  find(/\bproves?\b/i, 'proof from one test');
  find(EXERCISE_NOUNS, 'exercise prescription');
  find(SYMMETRY_CLAIM, 'balanced, safe or ready about left-right results');
  return [...new Set(hits)];
}

const significantWords = (label: string) =>
  label.toLowerCase().replace(/\([^)]*\)/g, ' ').split(/[^a-z0-9-]+/).filter((w) => w.length >= 3 || /\d/.test(w));

/** First section of the output (the big picture or the athlete's Summary): everything before the second level-2 heading. */
const firstSection = (output: string) => output.split(/^##[ \t]/m).slice(0, 2).join('##');

/**
 * Below-average results (data.belowAverage) the output does not name in its first section. Loose match: at least half
 * of the label's significant words appear, so "5-10-5 shuttle" names "5-10-5 Agility".
 */
export function belowAverageNotNamed(output: string, data: ReportData): string[] {
  const text = firstSection(output).toLowerCase();
  return (data.belowAverage ?? [])
    .filter((b) => {
      const words = significantWords(b.label);
      return words.length > 0 && words.filter((w) => text.includes(w)).length < Math.ceil(words.length / 2);
    })
    .map((b) => b.label);
}

/** Bullets under "What to Work On": the focus results of a family text. */
export function focusResultCount(output: string): number {
  const section = output.split(/^##[ \t]+/m).find((s) => s.replace(/’/g, "'").trim().startsWith('What to Work On')) ?? '';
  return section.split('\n').filter((l) => /^\s*(?:[-*]|\d+[.)])\s+/.test(l)).length;
}

/** All checks for one output of the given report data; returns the failures (empty = pass). */
export function checkInsights(input: {
  output: string;
  data: ReportData; // what generateCoachingInsights was given (audience included)
  athleteNames?: string[]; // roster of a team report: none may appear
  overrides?: AIPromptOverrides; // the prompt wording the output was generated with
}): string[] {
  const { output, data } = input;
  // Team reports are always written for coaches (buildReportDataForAI ignores any other audience for them)
  const audience = data.reportType === "team" ? "coach" : data.audience ?? "coach";
  const prompt = buildPrompt({ ...data, audience }, input.overrides);
  const failures: string[] = [];

  // De-identification: the model must neither see the athlete's name nor leave the placeholder unfilled
  if (data.athleteName && athleteNamesIn(prompt, [data.athleteName]).length > 0) failures.push("athlete name in the prompt");
  const placeholders = output.match(/\{\{?[^{}]*\}?\}/g) ?? [];
  if (placeholders.length > 0) failures.push(`unfilled placeholder: ${[...new Set(placeholders)].join(", ")}`);

  // Small integers (counts such as "2 of 3") are in most report data, so they prove little
  const numbers = ungroundedNumbers(output, prompt);
  const isSmall = (n: string) => {
    const v = toNumber(n);
    return Number.isInteger(v) && Math.abs(v) <= 3;
  };
  const large = numbers.filter((n) => !isSmall(n));
  const small = numbers.filter(isSmall);
  if (large.length > 0) failures.push(`numbers not in the report data: ${large.join(", ")}`);
  if (small.length > 0) failures.push(`small integers not in the report data (weak check): ${small.join(", ")}`);

  const prescriptions = prescriptionNumbers(output);
  if (prescriptions.length > 0) failures.push(`training prescriptions not in the report data: ${prescriptions.join(", ")}`);

  if (data.reportType === "team" && input.athleteNames) {
    const names = athleteNamesIn(output, input.athleteNames);
    if (names.length > 0) failures.push(`athlete names in a team output: ${names.join(", ")}`);
  }

  const qualities = unmeasuredQualities(output);
  if (qualities.length > 0) failures.push(`unmeasured qualities: ${qualities.join(", ")}`);

  const medical = medicalWords(output);
  if (medical.length > 0) failures.push(`medical wording: ${medical.join(", ")}`);

  if (data.dataConfidence?.includes("no history")) {
    const words = changeWords(output);
    if (words.length > 0) failures.push(`change over time claimed without history: ${words.join(", ")}`);
  }

  failures.push(...headingIssues(output, audience, hasGoals(data)));

  // Family texts (parent, athlete): meaning, not data
  if (audience !== "coach") {
    const bare = bareNumberSentences(output);
    if (bare.length > 0) failures.push(`bare numbers (no meaning with them): ${bare.join(" | ")}`);
    const banned = neverSayHits(output);
    if (banned.length > 0) failures.push(`never-say wording: ${banned.join(", ")}`);
    const unnamed = belowAverageNotNamed(output, data);
    if (unnamed.length > 0) failures.push(`below-average results not named in the big picture: ${unnamed.join(", ")}`);
    const focus = focusResultCount(output);
    const minFocus = isLimitedData(data) ? 1 : 2;
    if (focus < minFocus || focus > 3) failures.push(`focus results ${focus}, expected ${minFocus}-3`);
  }

  const [min, max] = insightWordRange(data.reportType, audience, isLimitedData(data), hasGoals(data));
  const words = countWords(output);
  if (words < min || words > max) failures.push(`word count ${words} outside ${min}-${max}`);

  return failures;
}
