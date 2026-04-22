/**
 * MetricExplanationService
 *
 * Builds the merged metric-explanation map used anywhere we display metric
 * descriptions (reports, athlete pages). Merges, per field, in this order:
 *   1. Built-in explanations from @shared/metric-explanations
 *   2. site_metrics explanation columns (shortDescription / whatItMeasures / whyItMatters)
 *   3. site_metric_explanations table overrides (highest priority among site-level)
 *   4. custom_org_metrics (for codes that aren't built-ins)
 *
 * Extracted from ReportService.getMetricExplanationsMap so both the report
 * service and the athlete-facing route can share one implementation.
 */

import { db } from '../db';
import {
  siteMetrics,
  siteMetricExplanations,
  customOrgMetrics,
} from '@shared/schema';
import { and, eq, inArray } from 'drizzle-orm';
import {
  buildMetricExplanationsMap,
  type MetricExplanation,
  type CustomMetricsMap,
  type SiteOverridesMap,
} from '@shared/metric-explanations';

export async function getMetricExplanationsMap(
  metricCodes: string[],
  organizationId?: string,
): Promise<Record<string, MetricExplanation>> {
  if (metricCodes.length === 0) return {};

  const [siteMetricRows, siteOverrideRows, customRows] = await Promise.all([
    db
      .select({
        code: siteMetrics.code,
        shortDescription: siteMetrics.shortDescription,
        whatItMeasures: siteMetrics.whatItMeasures,
        whyItMatters: siteMetrics.whyItMatters,
      })
      .from(siteMetrics)
      .where(inArray(siteMetrics.code, metricCodes)),
    db
      .select()
      .from(siteMetricExplanations)
      .where(inArray(siteMetricExplanations.metricCode, metricCodes)),
    organizationId
      ? db
          .select({
            code: customOrgMetrics.code,
            label: customOrgMetrics.label,
            description: customOrgMetrics.description,
            shortDescription: customOrgMetrics.shortDescription,
            whatItMeasures: customOrgMetrics.whatItMeasures,
            whyItMatters: customOrgMetrics.whyItMatters,
            unit: customOrgMetrics.unit,
            metricType: customOrgMetrics.metricType,
          })
          .from(customOrgMetrics)
          .where(
            and(
              eq(customOrgMetrics.organizationId, organizationId),
              inArray(customOrgMetrics.code, metricCodes),
            ),
          )
      : Promise.resolve([] as Array<{
          code: string;
          label: string;
          description: string | null;
          shortDescription: string | null;
          whatItMeasures: string | null;
          whyItMatters: string | null;
          unit: string | null;
          metricType: 'lower_is_better' | 'higher_is_better' | 'tracking' | null;
        }>),
  ]);

  const siteOverrides: SiteOverridesMap = {};

  for (const row of siteMetricRows) {
    const entry: Record<string, string | null> = {};
    if (row.shortDescription != null) entry.shortDescription = row.shortDescription;
    if (row.whatItMeasures != null) entry.whatItMeasures = row.whatItMeasures;
    if (row.whyItMatters != null) entry.whyItMatters = row.whyItMatters;
    if (Object.keys(entry).length > 0) {
      siteOverrides[row.code] = entry;
    }
  }

  for (const row of siteOverrideRows) {
    const entry: Record<string, string | null> = { ...siteOverrides[row.metricCode] };
    if (row.title != null) entry.title = row.title;
    if (row.shortDescription != null) entry.shortDescription = row.shortDescription;
    if (row.whatItMeasures != null) entry.whatItMeasures = row.whatItMeasures;
    if (row.whyItMatters != null) entry.whyItMatters = row.whyItMatters;
    if (Object.keys(entry).length > 0) {
      siteOverrides[row.metricCode] = entry;
    }
  }

  const customMap: CustomMetricsMap = {};
  for (const row of customRows) {
    customMap[row.code] = {
      label: row.label,
      description: row.description,
      shortDescription: row.shortDescription,
      whatItMeasures: row.whatItMeasures,
      whyItMatters: row.whyItMatters,
      unit: row.unit,
      metricType: row.metricType,
    };
  }

  return buildMetricExplanationsMap(metricCodes, customMap, siteOverrides);
}
