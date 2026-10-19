/**
 * Output checks for AI coaching insights (eval harness). Pure functions, no network.
 *
 * Used by the unit tests on recorded sample outputs and by scripts/eval-ai-insights.ts on live
 * outputs. They catch the failures that matter most for a shared report: numbers or training
 * prescriptions the model made up, athlete names in a team report, comments on unmeasured
 * qualities, change over time claimed without history, wrong headings (the web card and PDF expect
 * fixed sections) and length outside the range the prompt asks for.
 */

import {
  buildPrompt,
  INSIGHT_HEADINGS,
  insightWordRange,
  isLimitedData,
  type ReportData,
} from "./ai-insights-service";

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
export function headingIssues(output: string, audience: NonNullable<ReportData["audience"]>): string[] {
  const expected = INSIGHT_HEADINGS[audience];
  const found = output
    .replace(/’/g, "'")
    .split("\n")
    .map((line) => line.match(/^##\s+(.*?)\s*$/)?.[1].replace(/\*\*/g, "").replace(/:$/, "").trim())
    .filter((h): h is string => !!h);
  const issues: string[] = [];
  const missing = expected.filter((h) => !found.includes(h));
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

/** All checks for one output of the given report data; returns the failures (empty = pass). */
export function checkInsights(input: {
  output: string;
  data: ReportData; // what generateCoachingInsights was given (audience included)
  athleteNames?: string[]; // roster of a team report: none may appear
}): string[] {
  const { output, data } = input;
  // Team reports are always written for coaches (buildReportDataForAI ignores any other audience for them)
  const audience = data.reportType === "team" ? "coach" : data.audience ?? "coach";
  const prompt = buildPrompt({ ...data, audience });
  const failures: string[] = [];

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

  if (data.dataConfidence?.includes("no history")) {
    const words = changeWords(output);
    if (words.length > 0) failures.push(`change over time claimed without history: ${words.join(", ")}`);
  }

  failures.push(...headingIssues(output, audience));

  const [min, max] = insightWordRange(data.reportType, audience, isLimitedData(data));
  const words = countWords(output);
  if (words < min || words > max) failures.push(`word count ${words} outside ${min}-${max}`);

  return failures;
}
