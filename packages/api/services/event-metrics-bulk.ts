/**
 * Save a whole metric list on an event in one request (new-event form).
 * Codes that can not be event metrics are skipped with a reason instead of failing the request:
 * 'unknown' (no site_metrics row), 'inactive' (switched off) and 'derived' (computed, never entered).
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { eventMetrics, siteMetrics } from "@shared/schema";
import { EventMetricsService, type BulkAddMetricItem } from "./event-metrics-service";

export type SkipReason = "unknown" | "inactive" | "derived";

export interface BulkAddResult {
  /** Codes actually inserted by this request */
  added: string[];
  alreadyPresent: string[];
  skipped: Array<{ metricCode: string; reason: SkipReason }>;
}

/** Throws EventMetricsFrozenError for a frozen event (also when every code would have been skipped). */
export async function bulkAddEventMetrics(eventId: string, userId: string, requested: BulkAddMetricItem[]): Promise<BulkAddResult> {
  const seen = new Set<string>();
  const items = requested.filter((m) => !seen.has(m.metricCode) && !!seen.add(m.metricCode));

  const rows = items.length
    ? await db.select({ code: siteMetrics.code, isActive: siteMetrics.isActive, isDerived: siteMetrics.isDerived }).from(siteMetrics).where(inArray(siteMetrics.code, items.map((m) => m.metricCode)))
    : [];
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const present = new Set((await db.select({ code: eventMetrics.metricCode }).from(eventMetrics).where(eq(eventMetrics.eventId, eventId))).map((r) => r.code));

  const skipped: BulkAddResult["skipped"] = [];
  const alreadyPresent: string[] = [];
  const toAdd: BulkAddMetricItem[] = [];
  for (const item of items) {
    const row = byCode.get(item.metricCode);
    if (!row) skipped.push({ metricCode: item.metricCode, reason: "unknown" });
    else if (row.isDerived) skipped.push({ metricCode: item.metricCode, reason: "derived" });
    else if (!row.isActive) skipped.push({ metricCode: item.metricCode, reason: "inactive" });
    else if (present.has(item.metricCode)) alreadyPresent.push(item.metricCode);
    else toAdd.push(item);
  }

  const inserted = await new EventMetricsService(storage).bulkAddMetrics(eventId, userId, toAdd, { skipExisting: true });
  const insertedCodes = new Set(inserted.map((r) => r.metricCode));
  // A code a concurrent request added in between was skipped by the insert
  const raced = toAdd.filter((m) => !insertedCodes.has(m.metricCode)).map((m) => m.metricCode);
  return { added: toAdd.filter((m) => insertedCodes.has(m.metricCode)).map((m) => m.metricCode), alreadyPresent: [...alreadyPresent, ...raced], skipped };
}
