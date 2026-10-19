/**
 * Output checks for AI coaching insights (eval harness). Pure functions, no network.
 *
 * Used by the unit tests on recorded sample outputs and by scripts/eval-ai-insights.ts on live
 * outputs. They catch the failures that matter most for a shared report: numbers the model made up,
 * athlete names in a team report, missing headings (the web card and PDF expect fixed sections)
 * and length outside the range the prompt asks for.
 */

import { INSIGHT_HEADINGS, insightWordRange, type ReportData } from "./ai-insights-service";

const NUMBER = /\d+(?:\.\d+)?/g;

/** Numbers in the output whose value does not appear anywhere in the prompt (1.5 matches 1.50). */
export function ungroundedNumbers(output: string, prompt: string): string[] {
  const known = new Set((prompt.match(NUMBER) ?? []).map(Number));
  return (output.match(NUMBER) ?? []).filter((n) => !known.has(Number(n)));
}

/** Names (or name parts of 3+ letters) that appear in the output as whole words. */
export function athleteNamesIn(output: string, names: string[]): string[] {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return names.filter((name) =>
    [name, ...name.split(/\s+/).filter((part) => part.length >= 3)].some((part) =>
      new RegExp(`\\b${escape(part)}\\b`).test(output),
    ),
  );
}

/** Audience headings not present as a markdown heading line (#, ## or ###, what the PDF renders). */
export function missingHeadings(output: string, audience: NonNullable<ReportData["audience"]>): string[] {
  const headingLines = output
    .replace(/’/g, "'")
    .split("\n")
    .map((line) => line.match(/^#{1,3}\s+(.*?)\s*:?\s*$/)?.[1].replace(/\*\*/g, "").trim())
    .filter(Boolean);
  return INSIGHT_HEADINGS[audience].filter((h) => !headingLines.includes(h));
}

/** Words with at least one letter or digit, so markdown symbols do not count. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w)).length;
}

/** All checks for one output; returns the failures (empty = pass). */
export function checkInsights(input: {
  output: string;
  prompt: string; // everything the model was sent (system + user)
  reportType: ReportData["reportType"];
  audience?: ReportData["audience"];
  athleteNames?: string[]; // roster of a team report: none may appear
}): string[] {
  const audience = input.reportType === "team" ? "coach" : input.audience ?? "coach";
  const failures: string[] = [];

  const numbers = ungroundedNumbers(input.output, input.prompt);
  if (numbers.length > 0) failures.push(`numbers not in the input: ${numbers.join(", ")}`);

  if (input.reportType === "team" && input.athleteNames) {
    const names = athleteNamesIn(input.output, input.athleteNames);
    if (names.length > 0) failures.push(`athlete names in a team output: ${names.join(", ")}`);
  }

  const headings = missingHeadings(input.output, audience);
  if (headings.length > 0) failures.push(`missing headings: ${headings.join(", ")}`);

  const [min, max] = insightWordRange(input.reportType, audience);
  const words = countWords(input.output);
  if (words < min || words > max) failures.push(`word count ${words} outside ${min}-${max}`);

  return failures;
}
