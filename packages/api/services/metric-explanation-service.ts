/**
 * MetricExplanationService
 *
 * Builds the merged metric-explanation map used anywhere we display metric
 * descriptions (reports, athlete pages). Merges, per field, in this order:
 *   1. Built-in explanations from @shared/metric-explanations
 *   2. site_metrics explanation columns (shortDescription / whatItMeasures / whyItMatters)
 *   3. site_metric_explanations table overrides (highest priority among site-level)
 *   4. custom_org_metrics (for codes that aren't built-ins)
 * For codes without a built-in, the site_metrics label, unit and direction feed the fallback text.
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

/** Family-facing meaning text and who wrote it ('org' = organization-written, to be marked as such in prompts). */
export type MetricMeaning = { text: string; source: 'org' | 'site' };

export async function getMetricExplanationsMap(
  metricCodes: string[],
  organizationId?: string,
): Promise<Record<string, MetricExplanation>> {
  return (await getMetricExplanationsAndMeanings(metricCodes, organizationId)).explanations;
}

/**
 * Same merge as getMetricExplanationsMap, plus `meaningMap`: code -> family-facing meaning text from
 * custom_org_metrics (this organization, source 'org') over site_metrics (source 'site'). Codes without stored
 * meaning are absent.
 */
export async function getMetricExplanationsAndMeanings(
  metricCodes: string[],
  organizationId?: string,
): Promise<{ explanations: Record<string, MetricExplanation>; meaningMap: Record<string, MetricMeaning> }> {
  if (metricCodes.length === 0) return { explanations: {}, meaningMap: {} };

  const [siteMetricRows, siteOverrideRows, customRows] = await Promise.all([
    db
      .select({
        code: siteMetrics.code,
        label: siteMetrics.label,
        unit: siteMetrics.unit,
        metricType: siteMetrics.metricType,
        shortDescription: siteMetrics.shortDescription,
        whatItMeasures: siteMetrics.whatItMeasures,
        whyItMatters: siteMetrics.whyItMatters,
        meaning: siteMetrics.meaning,
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
            meaning: customOrgMetrics.meaning,
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
          meaning: string | null;
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

  // Site metrics without a built-in explanation still have a label, unit and direction of their own. Their
  // description is an admin-facing note (it can cite internal docs), so it is not used as athlete-facing text.
  // Org custom metrics (below) take precedence for the same code
  const customMap: CustomMetricsMap = {};
  for (const row of siteMetricRows) {
    customMap[row.code] = {
      label: row.label,
      description: null,
      unit: row.unit,
      metricType: row.metricType,
    };
  }
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

  const meaningMap: Record<string, MetricMeaning> = {};
  for (const row of siteMetricRows) if (row.meaning?.trim()) meaningMap[row.code] = { text: row.meaning.trim(), source: 'site' };
  // The custom query is by organization, not by code: keep only the codes the caller asked for
  const asked = new Set(metricCodes);
  for (const row of customRows) if (asked.has(row.code) && row.meaning?.trim()) meaningMap[row.code] = { text: row.meaning.trim(), source: 'org' };

  return { explanations: buildMetricExplanationsMap(metricCodes, customMap, siteOverrides), meaningMap };
}
