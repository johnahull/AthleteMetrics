/**
 * What a result says about the athlete and the sport, in parent words: the vetted text the family insights may use
 * for sport-meaning claims. Deliberately separate from BUILT_IN_METRIC_EXPLANATIONS (glossary text for the metric
 * screens). One `meaning` per test, no digits, 60 words at most (enforced by the coverage test); a test lists every
 * code variant explicitly (never prefixes). Text drafted by the head of performance; edit it here, git is the trail.
 */

const MEANINGS: Array<{ codes: string[]; meaning: string }> = [
  {
    codes: ['DASH_10YD', 'DASH_10M'],
    meaning: 'How fast the athlete gets going from a standstill. A slow time means the first steps have room to grow. Every sprint starts here, and a slow start costs time in every sprint, including a long one.',
  },
  {
    codes: ['DASH_20YD', 'DASH_20M'],
    meaning: 'How well speed keeps building after the first steps. Covers most short game sprints; with the start, it shows how much of a race goes to speeding up.',
  },
  {
    codes: ['DASH_30YD', 'DASH_30M'],
    meaning: 'How well speed keeps building as the athlete nears top speed. Links the start to top speed and hints at where top speed arrives.',
  },
  {
    codes: ['DASH_40YD', 'DASH_40M'],
    meaning: 'Overall straight-line speed. A slow time can come from the start, from top speed, or both; the splits tell which. Read the splits before choosing what to train.',
  },
  {
    codes: ['FLY10_TIME', 'FLY10M_TIME', 'FLY10_TIME_RI5', 'FLY10_TIME_RI10', 'FLY10_TIME_RI15', 'FLY10_TIME_RI30'],
    meaning: 'How fast the athlete moves once already running; the running start is the distance run before timing starts. Short running starts are still speeding up, long ones are near top speed. Compare only times with the same running start. Matters most in longer sprints.',
  },
  {
    codes: ['AGILITY_5105', 'AGILITY_5105_L', 'AGILITY_5105_R'],
    meaning: 'How quickly the athlete stops, turns and gets going again; a slow time can come from the turns or from straight speed. Change of direction in tight spaces; compare with the short straight sprint times to see what the turns cost.',
  },
  {
    codes: ['AGILITY_505_M', 'AGILITY_505_M_L', 'AGILITY_505_M_R', 'AGILITY_505_YD', 'AGILITY_505_YD_L', 'AGILITY_505_YD_R'],
    meaning: 'How well the athlete brakes and turns once moving fast; one sharp turn, so it shows turning more than straight speed. Cutting and turning after a run; each leg can be tested alone.',
  },
  {
    codes: ['T_TEST'],
    meaning: 'Moving forward, sideways and backward with quick changes. Shows footwork and control in every direction; good for following footwork over time.',
  },
  {
    codes: ['JUMP_CMJ_HOH'],
    meaning: 'How high the athlete jumps after a quick dip with no arm swing; leg power on its own. Supports jumping and the push of the first sprint steps; read it with the paused-squat jump. Compare only jumps done the same way.',
  },
  {
    codes: ['VERTICAL_JUMP'],
    meaning: 'How high the athlete jumps straight up: leg power. Supports jumping and the push of the first sprint steps. Compare only jumps done the same way, since arm swing changes the result.',
  },
  {
    codes: ['JUMP_SJ_HEIGHT'],
    meaning: 'A jump from a paused squat with no dip: how much push the legs make from a still start. Compared with the jump with a dip, it shows whether the athlete gains from the dip yet.',
  },
  {
    codes: ['POWER_EUR'],
    meaning: 'Compares the jump with a dip to the jump from a pause. When close, the athlete gains little from the dip so far; a skill that can grow. One test day is not enough to judge it.',
  },
  {
    codes: ['RSI', 'RSI_105'],
    meaning: 'How high the athlete hops while spending little time on the ground; read with hop height and ground time. A quick, springy ground touch helps fast running and cuts.',
  },
  {
    codes: ['RSI_105_HEIGHT'],
    meaning: 'How high the quick hops go; higher at the same ground time means more push. Read with ground time.',
  },
  {
    codes: ['RSI_105_GCT'],
    meaning: 'How long the feet stay down on each hop; shorter at the same height means a quicker bounce. A short touch is part of fast running.',
  },
  {
    codes: ['HOP_SL_TRIPLE_L', 'HOP_SL_TRIPLE_R'],
    meaning: 'How far the athlete travels in three hops on one leg: one-leg forward power and control. Sprinting happens one leg at a time; compare each leg with its own past results.',
  },
  {
    codes: ['HOP_SL_TRIPLE_LSI'],
    meaning: 'How close the two legs\' hop distances are. Close means similar distances, not equal strength. Read with the distances; both legs can match and still have room to go farther.',
  },
  {
    codes: ['JUMP_BROAD'],
    meaning: 'How far the athlete jumps forward from two feet: forward power that feeds the sprint start.',
  },
  {
    codes: ['PEAK_POWER_REL'],
    meaning: 'An estimate of leg power for the athlete\'s size, worked out from the jump; mostly follows jump height and is rough for young athletes. Tracked over time, never used to rank.',
  },
  {
    codes: ['TOP_SPEED', 'TOP_SPEED_MPH'],
    meaning: 'The fastest the athlete ran, measured directly. Matters most in longer sprints; compare only results from the same device.',
  },
];

/** Code -> vetted meaning text (an entry listing several codes is spread over each of them). */
export const BUILT_IN_METRIC_MEANINGS: Record<string, string> = Object.fromEntries(
  MEANINGS.flatMap(({ codes, meaning }) => codes.map((c) => [c, meaning])),
);

/** Never described to a family: the numbers would only invite remarks (body weight, absolute watts). */
export const NO_MEANING: string[] = ['HEIGHT_IN', 'WEIGHT_LBS', 'PEAK_POWER_W'];

/**
 * Built-in codes whose meaning is not written yet (follow-up batches). Listed explicitly so the gap is visible and the
 * coverage test still passes; such a metric is reported plainly with no interpretation.
 */
export const PENDING_MEANING: string[] = [
  'STANDING_REACH', 'WINGSPAN', 'DASH_5YD',
  'AGILITY_505_M_LSI', 'AGILITY_505_YD_LSI',
  'AGILITY_COD_DEFICIT_M', 'AGILITY_COD_DEFICIT_M_INTERP', 'AGILITY_COD_DEFICIT_YD',
  'JUMP_CMJ_SL_L', 'JUMP_CMJ_SL_R', 'MOMENTUM',
  'APPROACH_REACH', 'APPROACH_JUMP', 'BLOCK_REACH', 'BLOCK_JUMP',
  'RSI_L', 'RSI_R', 'RSI_SINGLE_LEFT', 'RSI_SINGLE_RIGHT', 'RSI_ASYM',
  'HOP_SL_TRIPLE_BL_L', 'HOP_SL_TRIPLE_BL_R', 'HOP_SL_TRIPLE_BL_LSI',
  'BENCH_1RM', 'SQUAT_1RM', 'DEADLIFT_1RM', 'OHP_1RM',
  'BENCH_1RM_KG', 'SQUAT_1RM_KG', 'DEADLIFT_1RM_KG', 'OHP_1RM_KG',
  'PULLUPS_MAX', 'PUSHUPS_MAX',
  'COND_YYIR1_DISTANCE', 'COND_VO2MAX_EST',
  'MQ_LIN_ACCEL', 'MQ_MAX_VELO', 'MQ_DECEL', 'MQ_SHUFFLE', 'MQ_LATRUN', 'MQ_HIPTURN', 'MQ_BACKPEDAL', 'MQ_JUMP',
  'MQI_TOTAL', 'MQ_TRANS_DECEL_CUT', 'MQ_TRANS_GAS_BRAKE', 'MQ_TRANS_BACKPEDAL_TURN', 'MQ_TRANS_LAT_LINEAR', 'MQ_TRANSITION_TOTAL',
];

export type MetricMeaning = { text: string; orgWritten: boolean };

/** Codes with a built-in meaning. */
export const metricMeaningCodes = (): string[] => Object.keys(BUILT_IN_METRIC_MEANINGS);

/**
 * The meaning to use for a code: custom org metric text > site metric text > built-in text. The maps are optional
 * (the columns that fill them arrive separately); blank text falls through. A NO_MEANING code never has one.
 * `orgWritten` marks text an organization wrote, so the prompt can say so.
 */
export function getMetricMeaning(
  code: string,
  maps: { customMap?: Record<string, string | null | undefined>; siteMap?: Record<string, string | null | undefined> } = {},
): MetricMeaning | undefined {
  if (NO_MEANING.includes(code)) return undefined;
  const custom = maps.customMap?.[code]?.trim();
  if (custom) return { text: custom, orgWritten: true };
  const site = maps.siteMap?.[code]?.trim();
  if (site) return { text: site, orgWritten: false };
  const builtIn = Object.prototype.hasOwnProperty.call(BUILT_IN_METRIC_MEANINGS, code) ? BUILT_IN_METRIC_MEANINGS[code] : undefined;
  return builtIn ? { text: builtIn, orgWritten: false } : undefined;
}
