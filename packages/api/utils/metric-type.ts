/**
 * Server-side metric direction: the type stored on the metric's own row decides, never a hard-coded code list.
 */

import { db } from '../db';
import { and, eq, inArray } from 'drizzle-orm';
import { customOrgMetrics, siteMetrics, type MetricType } from '@shared/schema';

// Codes come from user requests, so the warn-once memory is capped: when full it starts over
const MAX_WARNED_CODES = 1000;
const warnedUnknownCodes = new Set<string>();

/**
 * Resolves the type of each metric code: the site_metrics row first, else the organization's custom metric.
 * Inactive and archived rows count too, because old measurements still need a direction.
 * Not cached, so an admin edit applies at once. A code with no row is higher_is_better, with one warning per code.
 * @param codes - Metric codes; duplicates are fine
 * @param organizationId - The organization whose custom metrics apply (the measurement row's or report's org)
 * @returns A map with an entry for every code; at most 2 queries
 */
export async function getMetricTypes(codes: string[], organizationId?: string | null): Promise<Record<string, MetricType>> {
  const uniqueCodes = [...new Set(codes)];
  const types: Record<string, MetricType> = {};
  if (uniqueCodes.length === 0) return types;

  const siteRows = await db
    .select({ code: siteMetrics.code, metricType: siteMetrics.metricType })
    .from(siteMetrics)
    .where(inArray(siteMetrics.code, uniqueCodes));
  for (const row of siteRows) types[row.code] = row.metricType;

  const missing = uniqueCodes.filter(code => !types[code]);
  if (missing.length > 0 && organizationId) {
    const customRows = await db
      .select({ code: customOrgMetrics.code, metricType: customOrgMetrics.metricType })
      .from(customOrgMetrics)
      .where(and(inArray(customOrgMetrics.code, missing), eq(customOrgMetrics.organizationId, organizationId)));
    for (const row of customRows) types[row.code] = row.metricType;
  }

  for (const code of uniqueCodes) {
    if (types[code]) continue;
    types[code] = 'higher_is_better';
    if (!warnedUnknownCodes.has(code)) {
      if (warnedUnknownCodes.size >= MAX_WARNED_CODES) warnedUnknownCodes.clear();
      warnedUnknownCodes.add(code);
      console.warn(`[metric-type] No metric row for code "${code}"; treating it as higher_is_better`);
    }
  }
  return types;
}

/** The type of one metric code; see getMetricTypes. */
export async function getMetricType(metricCode: string, organizationId?: string | null): Promise<MetricType> {
  return (await getMetricTypes([metricCode], organizationId))[metricCode];
}

/**
 * Determines if lower values are better for a given metric
 * @param metricCode - The metric code to check
 * @param organizationId - The organization whose custom metrics apply
 * @returns true if lower values are better (e.g., times), false otherwise
 */
export async function isLowerBetter(metricCode: string, organizationId?: string | null): Promise<boolean> {
  return (await getMetricType(metricCode, organizationId)) === 'lower_is_better';
}
