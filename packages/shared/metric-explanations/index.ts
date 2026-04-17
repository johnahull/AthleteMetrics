import {
  BUILT_IN_METRIC_EXPLANATIONS,
  BUILT_IN_METRIC_CODES,
  GENERIC_CUSTOM_METRIC_PLACEHOLDER,
  type MetricExplanation,
} from './built-ins';

export { BUILT_IN_METRIC_EXPLANATIONS, BUILT_IN_METRIC_CODES, GENERIC_CUSTOM_METRIC_PLACEHOLDER };
export type { MetricExplanation };

export type CustomMetricEntry = {
  label: string;
  description: string | null;
  unit?: string | null;
  metricType?: 'lower_is_better' | 'higher_is_better' | 'tracking' | null;
};

export type CustomMetricsMap = Record<string, CustomMetricEntry>;

function mapDirection(metricType: CustomMetricEntry['metricType']): 'lower' | 'higher' | 'tracking' {
  if (metricType === 'lower_is_better') return 'lower';
  if (metricType === 'tracking') return 'tracking';
  return 'higher';
}

function buildCustomUnitNote(
  entry: CustomMetricEntry | undefined,
  direction: 'lower' | 'higher' | 'tracking',
): string {
  const unit = entry?.unit?.trim();
  let directionText: string;
  if (direction === 'lower') directionText = 'lower is better';
  else if (direction === 'higher') directionText = 'higher is better';
  else directionText = 'tracked value, not judged as better or worse';

  if (unit) {
    return `Measured in ${unit}; ${directionText}.`;
  }
  return `Unit depends on the metric configured by your organization; ${directionText}.`;
}

export function getMetricExplanation(
  code: string,
  customMetricsMap?: CustomMetricsMap,
): MetricExplanation {
  const builtIn = BUILT_IN_METRIC_EXPLANATIONS[code];
  if (builtIn) {
    return builtIn;
  }

  const custom = customMetricsMap?.[code];
  const title = custom?.label?.trim() ? custom.label : code;
  const trimmedDescription = custom?.description?.trim();
  const description = trimmedDescription || GENERIC_CUSTOM_METRIC_PLACEHOLDER;
  const direction = mapDirection(custom?.metricType);

  return {
    title,
    shortDescription: description,
    whatItMeasures: description,
    whyItMatters:
      'Your coach added this metric to track something specific to your sport or training focus. Reach out if you want more context on how it applies to your goals.',
    unitNote: buildCustomUnitNote(custom, direction),
    directionOfBetter: direction,
  };
}

export function buildMetricExplanationsMap(
  codes: string[],
  customMetricsMap?: CustomMetricsMap,
): Record<string, MetricExplanation> {
  const out: Record<string, MetricExplanation> = {};
  const seen = new Set<string>();
  for (const code of codes) {
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out[code] = getMetricExplanation(code, customMetricsMap);
  }
  return out;
}
