/**
 * Family-insight meaning layer: which vetted meanings reach the prompt, the locked "never say" and meaning rules,
 * and the goal-length focus rule. Pure functions over ReportData (type-only import, so no cycle with the service).
 */
import { NO_MEANING, getMetricMeaning } from "@shared/metric-explanations/meanings";
import { belowAverageStanding, tierPlace, type ComparisonLike } from "./benchmark-standing";
import type { ReportData } from "./ai-insights-service";

/** At most this many metrics carry a meaning in the prompt (goal metrics first, then below-average results). */
export const MAX_MEANING_METRICS = 6;

/** Locked for parent and athlete audiences; sits after the tone text so a tone override cannot remove it. */
export const NEVER_SAY = [
  `NEVER SAY:`,
  `- Diagnosis, "cleared", return-to-play or injury-risk wording.`,
  `- Predicted times or outcomes; promises about making a team, recruiting, scholarships or "potential".`,
  `- Remarks on body weight or body composition.`,
  `- That one test proves a deficit.`,
  `- A comparison of fly times from different running starts or sessions, or with named teammates or other athletes.`,
  `- Exercise prescriptions: no exercises, sets, reps or loads.`,
  `- "Balanced", "safe" or "ready" about left-right results.`,
].join('\n');

/**
 * Locked for parent and athlete audiences: how to use the vetted meanings and how to shape the text. The "How results
 * connect" step is named only when that section is in the prompt.
 */
export function meaningRules(hasConnections: boolean): string {
  return [
    `WHAT RESULTS MEAN:`,
    `- These rules and NEVER SAY override the checklist examples below.`,
    `- Sport meaning only from the "What the metrics mean (vetted)" section; a result with no entry is reported plainly. Say only what the vetted meaning line says. Never join two metrics in your own words unless a "How results connect" line does it.`,
    `- Big picture first: 2-3 sentences, relative to the goal, including every "Below average results" item in the wording given. If you use the phrase "bottom of the range", say once that it means the lowest group for that age and sex, not pass or fail.`,
    `- "What's Going Well" only holds results listed under "Going Well Candidates", in the wording given (a "meets the group standard" result is never called above average). If none is listed, write one line: "No result is above average yet; the closest to average is" followed by that result (name it, give no percentile), or leave the section out.`,
    `- Then 2-3 focus results under What to Work On (one if the data is thin): (1) the results the goal is built from; ${hasConnections ? '(2) a result that explains a limiter through a "How results connect" line; (3) ' : '(2) '}the biggest below-average gap, only if it matters to the goal. Others stay in the big picture.`,
    `- Each focus result: what it is, what it means (vetted text), what we do. No bare numbers: give each with its meaning in everyday words.${hasConnections ? ' When a "How results connect" line applies, paraphrase it with its consequence (for example, "the dip is not adding height yet, so we retest fresh").' : ''}`,
    `- Give a percentile only as "faster or higher than about N out of 100 in the comparison group". Never write "lower N%", "top N%" or "bottom N%". Never print tier names: say "about 0.10 seconds faster would put the result in the next group up".`,
    `- Never mention how many metrics have benchmarks, or what the report "gives" or "cannot show". At most one plain sentence: "This shows one test day, not change over time."`,
    `- At most 20 words per sentence. Write "jump with a quick dip" every time, never "countermovement jump". Never say "flagged", "splits", "KPI" or "noise". State the goal once.`,
    `- Never say the report lacks or does not provide a result, date or test; at most say a 60-yard time would be a useful test. Put the "one test day" sentence in the big picture only. Never recommend a test or exercise that is not already in the data. Give percentiles to athletes the same way ("about N out of 100").`,
    `- Never work out a goal speed or predicted time. Say "from one 40-yard run" for split figures. If the report says testing came after lifting, say once that results may read low and a fresh retest matters.`,
  ].join('\n');
}

/** Fixed line for the test-day flags a family may hear about (the other flags stay private). */
export const TEST_CONDITIONS_LINE = `Test conditions (surface, weather or setup) may have affected some results; say so once, in general words.`;
const FAMILY_TEST_FLAGS = ['surface', 'weather', 'protocol_deviation'];

export function hasFamilyTestFlag(reportData: ReportData): boolean {
  return (reportData.coachNotes?.testDayFlags ?? []).some((f) => FAMILY_TEST_FLAGS.includes(f));
}

// Result codes a sprint goal is built from: start (first 10-20 yards) and top speed (fly times, top speed)
const START_CODES = ['DASH_10YD', 'DASH_10M', 'DASH_20YD', 'DASH_20M'];
const TOP_SPEED_CODES = ['FLY10_TIME', 'FLY10M_TIME', 'FLY10_TIME_RI15', 'FLY10_TIME_RI30', 'TOP_SPEED', 'TOP_SPEED_MPH'];

const GOAL_UNIT = '(?:yd|yds|yard|yards|y|m|meter|meters|metre|metres|dash|sprint)';
// "60 yd", "40-yard dash", "100m"; or a time before the distance: "7.0 60", "7.0-7.1 s 60", "a 4.6 40"
const GOAL_WITH_UNIT = new RegExp(`(?<![\\d.])(\\d{2,3})\\s*-?\\s*${GOAL_UNIT}(?![\\p{L}\\d])`, 'giu');
const GOAL_AFTER_TIME = /\d\.\d+\s*(?:s|secs?|seconds)?\s*(?:(?:in|for)\s+the\s+|a\s+)?(\d{2,3})(?![\d.]|\s*(?:kg|lbs?|pounds?|in|inch|inches|mph|reps?|man))/giu;

/**
 * Length class of a sprint goal in the goals text: 'long' (60 or longer), 'short' (shorter), or undefined. A distance
 * counts only with a sprint unit or word ("60 yd", "40-yard dash") or after a time ("7.0 60"); the longest one found wins.
 * "squat 100 kg", "40-inch vertical", "throw 60 mph" and "top 100 recruit" are not sprint goals.
 */
export function sprintGoalLength(goals: string): 'long' | 'short' | undefined {
  const distances = [...goals.matchAll(GOAL_WITH_UNIT), ...goals.matchAll(GOAL_AFTER_TIME)]
    .map((m) => Number(m[1]))
    .filter((d) => d >= 20 && d <= 400);
  if (distances.length === 0) return undefined;
  return Math.max(...distances) >= 60 ? 'long' : 'short';
}

export const GOAL_FOCUS_LINE: Record<'long' | 'short', string> = {
  long: `Goal focus: the goal is a long sprint (60 yards or longer), so the top-speed result comes first, then the start. Only for a goal this long, you may say more than half the distance is run near top speed.`,
  short: `Goal focus: the goal is a short sprint (40 yards or shorter), so the start comes first.`,
};

/**
 * Codes of results that carry a meaning, in priority order: the goal's results, then below-average results; capped.
 * Codes that share one meaning text (the fly variants) count once, so they cannot crowd out other results.
 */
export function selectMeaningMetrics(reportData: ReportData, goalLength?: 'long' | 'short'): string[] {
  const present = new Set(reportData.metrics.map((m) => m.code));
  const goalCodes = goalLength === 'long' ? [...TOP_SPEED_CODES, ...START_CODES] : goalLength === 'short' ? START_CODES : [];
  const ordered = [...goalCodes, ...(reportData.belowAverage ?? []).map((b) => b.code)];
  const picked: string[] = [];
  const texts = new Set<string>();
  for (const code of ordered) {
    const text = getMetricMeaning(code)?.text;
    if (!present.has(code) || picked.includes(code) || !text || texts.has(text)) continue;
    texts.add(text);
    picked.push(code);
  }
  return picked.slice(0, MAX_MEANING_METRICS);
}

/**
 * Family audiences never see height, weight or absolute watts: drop those metrics and every line that names them.
 * Metric lines are matched by exact label (the "metric" field) or, in key facts, by ": <label>, " so a label that is part
 * of another ("Peak Power" in "Relative Peak Power") is never removed by mistake.
 */
export function dropNoMeaningMetrics(reportData: ReportData): ReportData {
  const dropped = reportData.metrics.filter((m) => NO_MEANING.includes(m.code));
  if (dropped.length === 0) return reportData;
  const labels = dropped.map((m) => m.label);
  const named = (metric: string) => labels.includes(metric);
  const factNames = (fact: string) => labels.some((l) => fact.includes(`: ${l}, `));
  return {
    ...reportData,
    metrics: reportData.metrics.filter((m) => !NO_MEANING.includes(m.code)),
    history: reportData.history?.filter((h) => !NO_MEANING.includes(h.code)),
    distributions: reportData.distributions?.filter((d) => !NO_MEANING.includes(d.code)),
    belowAverage: reportData.belowAverage?.filter((b) => !NO_MEANING.includes(b.code)),
    aboveAverage: reportData.aboveAverage?.filter((b) => !NO_MEANING.includes(b.code)),
    keyFacts: reportData.keyFacts?.filter((f) => !factNames(f)),
    improvements: reportData.improvements?.filter((i) => !named(i.metric)),
    concerns: reportData.concerns?.filter((c) => !named(c.metric)),
    benchmarkComparisons: reportData.benchmarkComparisons?.filter((b) => !named(b.metric)),
  };
}

/**
 * Results below average for the comparison group (see benchmark-standing.ts for the one rule). A result in the bottom tier
 * whose label says "Average" reads "at the bottom of the range", since "below average" would contradict its label.
 * `comparisons` maps a metric code to the athlete's benchmark comparisons for it.
 */
export function belowAverageResults(
  metrics: ReportData['metrics'],
  comparisons: Record<string, ReadonlyArray<ComparisonLike> | undefined>,
): NonNullable<ReportData['belowAverage']> {
  const out: NonNullable<ReportData['belowAverage']> = [];
  for (const m of metrics) {
    if (!belowAverageStanding(comparisons[m.code], m.percentile)) continue;
    const atBottomAverage = (comparisons[m.code] ?? []).some((c) => tierPlace(c)?.bottom && /average/i.test(c.tierName ?? ''));
    out.push({ code: m.code, label: m.label, wording: atBottomAverage ? 'at the bottom of the range for the comparison group' : 'below average for the comparison group' });
  }
  return out;
}

/**
 * Results that may go under "What's Going Well": the same one standing rule (benchmark-standing.ts), not below average.
 * A result whose tier is fine but whose percentile is under 50 reads "meets the group standard", never "above average".
 */
export function aboveAverageResults(
  metrics: ReportData['metrics'],
  comparisons: Record<string, ReadonlyArray<ComparisonLike> | undefined>,
): NonNullable<ReportData['belowAverage']> {
  const out: NonNullable<ReportData['belowAverage']> = [];
  for (const m of metrics) {
    if (belowAverageStanding(comparisons[m.code], m.percentile) !== false) continue;
    const middling = m.percentile !== undefined && m.percentile < 50;
    out.push({ code: m.code, label: m.label, wording: middling ? 'meets the group standard' : 'above average for the comparison group' });
  }
  return out;
}
