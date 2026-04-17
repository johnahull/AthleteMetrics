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
  shortDescription?: string | null;
  whatItMeasures?: string | null;
  whyItMatters?: string | null;
};

export type CustomMetricsMap = Record<string, CustomMetricEntry>;

export type SiteOverridesMap = Record<string, Partial<Pick<MetricExplanation,
  'title' | 'shortDescription' | 'whatItMeasures' | 'whyItMatters'>>>;

function mapDirection(metricType: CustomMetricEntry['metricType']): 'lower' | 'higher' | 'tracking' {
  if (metricType === 'lower_is_better') return 'lower';
  if (metricType === 'higher_is_better') return 'higher';
  if (metricType === 'tracking') return 'tracking';
  // null / undefined / unknown — default to higher
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

const DEFAULT_CUSTOM_WHY =
  'Your coach added this metric to track something specific to your sport or training focus. Reach out if you want more context on how it applies to your goals.';

export function getMetricExplanation(
  code: string,
  customMetricsMap?: CustomMetricsMap,
  siteOverrides?: SiteOverridesMap,
): MetricExplanation {
  const builtIn = BUILT_IN_METRIC_EXPLANATIONS[code];
  const override = siteOverrides?.[code];

  if (builtIn) {
    // Per-field merge: site override (non-null) > built-in
    if (!override) return builtIn;
    return {
      ...builtIn,
      title: override.title ?? builtIn.title,
      shortDescription: override.shortDescription ?? builtIn.shortDescription,
      whatItMeasures: override.whatItMeasures ?? builtIn.whatItMeasures,
      whyItMatters: override.whyItMatters ?? builtIn.whyItMatters,
    };
  }

  // Custom / unknown metric path
  const custom = customMetricsMap?.[code];
  const title = override?.title ?? (custom?.label?.trim() ? custom.label : code);
  const trimmedDescription = custom?.description?.trim();
  const description = trimmedDescription || GENERIC_CUSTOM_METRIC_PLACEHOLDER;
  const direction = mapDirection(custom?.metricType);

  const shortDescription = override?.shortDescription
    ?? (custom?.shortDescription?.trim() || description);
  const whatItMeasures = override?.whatItMeasures
    ?? (custom?.whatItMeasures?.trim() || description);
  const whyItMatters = override?.whyItMatters
    ?? (custom?.whyItMatters?.trim() || DEFAULT_CUSTOM_WHY);

  return {
    title,
    shortDescription,
    whatItMeasures,
    whyItMatters,
    unitNote: buildCustomUnitNote(custom, direction),
    directionOfBetter: direction,
  };
}

export function buildMetricExplanationsMap(
  codes: string[],
  customMetricsMap?: CustomMetricsMap,
  siteOverrides?: SiteOverridesMap,
): Record<string, MetricExplanation> {
  const out: Record<string, MetricExplanation> = {};
  const seen = new Set<string>();
  for (const code of codes) {
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out[code] = getMetricExplanation(code, customMetricsMap, siteOverrides);
  }
  return out;
}
