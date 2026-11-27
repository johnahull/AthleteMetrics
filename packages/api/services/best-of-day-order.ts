import { desc, sql } from 'drizzle-orm';
import { customOrgMetrics, measurements, siteMetrics } from '@shared/schema';

/**
 * Sort key for a measurements query that puts the best value first (ascending): the value for a lower_is_better
 * metric, its negation otherwise (higher is better, as the leaderboard's best value). The direction is the row's own
 * metric: the site metric, else the custom metric of the row's organization (as the at-risk trend query reads it).
 *
 * A device import stores every run of a drill, so one athlete can have several rows of a metric on one date, all
 * with the same created_at. Ordering by date alone then picks an arbitrary run; add this key after the date.
 */
export const bestValueFirst = sql`CASE WHEN COALESCE(
  (SELECT ${siteMetrics.metricType} FROM ${siteMetrics} WHERE ${siteMetrics.code} = ${measurements.metric}),
  (SELECT ${customOrgMetrics.metricType} FROM ${customOrgMetrics}
    WHERE ${customOrgMetrics.code} = ${measurements.metric} AND ${customOrgMetrics.organizationId} = ${measurements.organizationId})
) = 'lower_is_better' THEN ${measurements.value} ELSE -${measurements.value} END`;

/** "Latest value" order: newest date first, then that date's best run. */
export const latestBestFirst = [desc(measurements.date), bestValueFirst] as const;
