import type { EventMetric, SiteMetric } from "@shared/schema";

/**
 * An event metric as GET /api/events/:id/metrics?includeDetails=true returns it:
 * the event_metrics row plus its site metric (null if the site metric was deleted).
 */
export type EventMetricWithSiteDetails = Pick<EventMetric, "metricCode"> & {
  customLabel?: string | null;
  metricDetails?: Pick<SiteMetric, "label" | "unit" | "category"> | null;
};

export interface EventMetricDisplay {
  code: string;
  label: string;
  unit?: string;
  category?: string;
}

/**
 * Readable name for an event metric: event custom label > site metric label > metric code.
 * Unit and category come from the site metric.
 */
export function getEventMetricDisplay(metric: EventMetricWithSiteDetails): EventMetricDisplay {
  const details = metric.metricDetails;
  return {
    code: metric.metricCode,
    label: metric.customLabel?.trim() || details?.label || metric.metricCode,
    unit: details?.unit?.trim() || undefined,
    category: details?.category || undefined,
  };
}
