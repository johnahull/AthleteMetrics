/**
 * Which site metrics may be event metrics. One rule for the bulk route, the single add route and the
 * eval template resolution:
 *   unknown      no site_metrics row
 *   derived      computed from other tests, never entered
 *   inactive     switched off by a site admin
 *   unavailable  site_metrics.available_org_types is set and does not list the organization's type
 *                (same rule as MetricService.getSiteMetrics with an orgType filter)
 */
import { inArray } from "drizzle-orm";
import { db } from "../db";
import { siteMetrics } from "@shared/schema";

export type IneligibleReason = "unknown" | "inactive" | "derived" | "unavailable";

export interface EligibilityRow {
  code: string;
  label: string;
  unit: string | null;
  category: string | null;
  isActive: boolean;
  isDerived: boolean;
  availableOrgTypes: string[] | null;
}

/** Anything with a `select` (the db or a transaction) */
type Executor = Pick<typeof db, "select">;

/** ONE query for all codes. */
export async function fetchEligibilityRows(codes: string[], executor: Executor = db): Promise<Map<string, EligibilityRow>> {
  if (codes.length === 0) return new Map();
  const rows = await executor
    .select({
      code: siteMetrics.code,
      label: siteMetrics.label,
      unit: siteMetrics.unit,
      category: siteMetrics.category,
      isActive: siteMetrics.isActive,
      isDerived: siteMetrics.isDerived,
      availableOrgTypes: siteMetrics.availableOrgTypes,
    })
    .from(siteMetrics)
    .where(inArray(siteMetrics.code, codes));
  return new Map(rows.map((r) => [r.code, r as EligibilityRow]));
}

/** Null when the metric may be an event metric of an organization of `orgType` (null orgType: no type check). */
export function ineligibleReason(row: EligibilityRow | undefined, orgType: string | null | undefined): IneligibleReason | null {
  if (!row) return "unknown";
  if (row.isDerived) return "derived";
  if (!row.isActive) return "inactive";
  if (orgType && row.availableOrgTypes && row.availableOrgTypes.length > 0 && !row.availableOrgTypes.includes(orgType)) return "unavailable";
  return null;
}

/** Plain message for the single-add route */
export const INELIGIBLE_MESSAGE: Record<IneligibleReason, (code: string) => string> = {
  unknown: (code) => `Metric '${code}' not found`,
  derived: (code) => `Metric '${code}' is calculated from other tests and cannot be added to an event`,
  inactive: (code) => `Metric '${code}' is not active`,
  unavailable: (code) => `Metric '${code}' is not available for this organization's type`,
};
