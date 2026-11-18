/**
 * Family-insight meaning layer: which vetted meanings reach the prompt, the locked "never say" and meaning rules,
 * and the goal-length focus rule. Pure functions over ReportData (type-only import, so no cycle with the service).
 */
import { NO_MEANING, getMetricMeaning } from "@shared/metric-explanations/meanings";
import type { ReportData } from "./ai-insights-service";

/** At most this many metrics carry a meaning in the prompt (goal metrics first, then below-average results). */
export const MAX_MEANING_METRICS = 6;

/** Locked for parent and athlete audiences; sits after the tone text so a tone override cannot remove it. */
export const NEVER_SAY = [
  `NEVER SAY:`,
  `- Diagnosis, "cleared", return-to-play or injury-risk wording.`,
  `- Predicted times or predicted outcomes.`,
  `- Any remark on body weight or body composition.`,
  `- That one test proves a deficit.`,
  `- A comparison of fly times from different running starts or different sessions.`,
  `- Exercise prescriptions: no exercises, sets, reps or loads.`,
  `- "Balanced", "safe" or "ready" about left-right results.`,
].join('\n');

/** Locked for parent and athlete audiences: how to use the vetted meanings and how to shape the text. */
export const MEANING_RULES = [
  `WHAT RESULTS MEAN:`,
  `- Make sport-meaning claims only from the "What the metrics mean (vetted)" section. A result with no entry there is reported plainly, with no interpretation.`,
  `- Big picture first: 2-3 sentences, relative to the goal when there is one. In it, name every result listed under "Below average results", kindly, using the wording given there.`,
  `- Then up to 3 focus results under What to Work On, chosen in this order: (1) the results the goal is built from; (2) a result that explains a limiter through a "How results connect" line; (3) the biggest below-average gap, only if it matters to the goal. Other results stay in the big picture.`,
  `- Each focus result says what it is, what it means (from the vetted section) and what we do about it. No bare numbers: a number always comes with its meaning in everyday words.`,
  `- Goal speeds are "about"; never a predicted time.`,
].join('\n');

/** Fixed line for the test-day flags a family may hear about (the other flags stay private). */
export const TEST_CONDITIONS_LINE = `Test conditions (surface, weather or setup) may have affected some results; say so once, in general words.`;
const FAMILY_TEST_FLAGS = ['surface', 'weather', 'protocol_deviation'];

export function hasFamilyTestFlag(reportData: ReportData): boolean {
  return (reportData.coachNotes?.testDayFlags ?? []).some((f) => FAMILY_TEST_FLAGS.includes(f));
}

// Result codes a sprint goal is built from: start (first 10-20 yards) and top speed (fly times, top speed)
const START_CODES = ['DASH_10YD', 'DASH_10M', 'DASH_20YD', 'DASH_20M'];
const TOP_SPEED_CODES = ['FLY10_TIME', 'FLY10M_TIME', 'FLY10_TIME_RI5', 'FLY10_TIME_RI10', 'FLY10_TIME_RI15', 'FLY10_TIME_RI30', 'TOP_SPEED', 'TOP_SPEED_MPH'];

/**
 * Length class of a sprint goal found in the goals text: 'long' (60 yards or longer), 'short' (40 yards or shorter),
 * or undefined. Only a distance written as a number of its own counts (the 60 of "a 7.0 60", not 7.0-7.1).
 */
export function sprintGoalLength(goals: string): 'long' | 'short' | undefined {
  const m = goals.match(/(?<![\d.])(40|60|100)(?![\d.])(?:\s*-?\s*(?:yd|yds|yard|yards|y|m|meter|meters|dash|sprint))?/i);
  if (!m) return undefined;
  return Number(m[1]) >= 60 ? 'long' : 'short';
}

export const GOAL_FOCUS_LINE: Record<'long' | 'short', string> = {
  long: `Goal focus: the goal is a long sprint (60 yards or longer), so the top-speed result comes first, then the start. Only for a goal this long, you may say more than half the race is run near top speed.`,
  short: `Goal focus: the goal is a short sprint (40 yards or shorter), so the start comes first.`,
};

/** Codes of results that carry a meaning, in priority order: the goal's results, then below-average results, then the rest; capped. */
export function selectMeaningMetrics(reportData: ReportData, goalLength?: 'long' | 'short'): string[] {
  const present = new Set(reportData.metrics.map((m) => m.code));
  const goalCodes = goalLength === 'long' ? [...TOP_SPEED_CODES, ...START_CODES] : goalLength === 'short' ? START_CODES : [];
  const ordered = [
    ...goalCodes,
    ...(reportData.belowAverage ?? []).map((b) => b.code),
  ];
  const picked: string[] = [];
  for (const code of ordered) {
    if (present.has(code) && !picked.includes(code) && getMetricMeaning(code)) picked.push(code);
  }
  return picked.slice(0, MAX_MEANING_METRICS);
}

/** Family audiences never see height, weight or absolute watts: drop those metrics and everything that names them. */
export function dropNoMeaningMetrics(reportData: ReportData): ReportData {
  const dropped = reportData.metrics.filter((m) => NO_MEANING.includes(m.code));
  if (dropped.length === 0) return reportData;
  const labels = dropped.map((m) => m.label.toLowerCase());
  const mentions = (text: string) => labels.some((l) => text.toLowerCase().includes(l));
  return {
    ...reportData,
    metrics: reportData.metrics.filter((m) => !NO_MEANING.includes(m.code)),
    history: reportData.history?.filter((h) => !NO_MEANING.includes(h.code)),
    distributions: reportData.distributions?.filter((d) => !NO_MEANING.includes(d.code)),
    belowAverage: reportData.belowAverage?.filter((b) => !NO_MEANING.includes(b.code)),
    keyFacts: reportData.keyFacts?.filter((f) => !mentions(f)),
    improvements: reportData.improvements?.filter((i) => !mentions(i.metric)),
    concerns: reportData.concerns?.filter((c) => !mentions(c.metric)),
    benchmarkComparisons: reportData.benchmarkComparisons?.filter((b) => !mentions(b.metric)),
  };
}

/**
 * Results below average for the comparison group, rank-based: the bottom tier of a tier group counts even when its label
 * is "Average" (the label then reads "at the bottom of the range"); without a tier, a percentile under 50.
 * `bottomTierNames` maps a metric code to the name of the bottom tier the athlete is in.
 */
export function belowAverageResults(metrics: ReportData['metrics'], bottomTierNames: Record<string, string>): NonNullable<ReportData['belowAverage']> {
  const out: NonNullable<ReportData['belowAverage']> = [];
  for (const m of metrics) {
    const tier = bottomTierNames[m.code];
    if (tier !== undefined) {
      const wording = /average/i.test(tier) ? 'at the bottom of the range for the comparison group' : 'below average for the comparison group';
      out.push({ code: m.code, label: m.label, wording });
    } else if (m.percentile !== undefined && m.percentile < 50) {
      out.push({ code: m.code, label: m.label, wording: 'below average for the comparison group' });
    }
  }
  return out;
}
