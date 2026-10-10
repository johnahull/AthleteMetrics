/**
 * Save a whole metric list on an event in one request (new-event form), all or nothing.
 * Codes that can not be event metrics are skipped with a reason instead of failing the request
 * (see event-metric-eligibility.ts). The insert and its audit row share ONE transaction; a code another
 * request inserted first is reported as alreadyPresent (ON CONFLICT DO NOTHING), never as an error.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { auditLogs, eventMetrics, events, organizations } from "@shared/schema";
import { EventMetricsFrozenError } from "./event-metrics-service";
import { fetchEligibilityRows, ineligibleReason, type IneligibleReason } from "./event-metric-eligibility";

export interface BulkAddItem {
  metricCode: string;
  displayOrder?: number;
  isRequired?: boolean;
  customLabel?: string;
}

export interface BulkAddResult {
  /** Codes actually inserted by this request */
  added: string[];
  alreadyPresent: string[];
  skipped: Array<{ metricCode: string; reason: IneligibleReason }>;
}

/** Throws EventMetricsFrozenError for a frozen event (also when every code would have been skipped). */
export async function bulkAddEventMetrics(eventId: string, userId: string, requested: BulkAddItem[]): Promise<BulkAddResult> {
  const seen = new Set<string>();
  const items = requested.filter((m) => !seen.has(m.metricCode) && !!seen.add(m.metricCode));

  return db.transaction(async (tx) => {
    const [event] = await tx
      .select({ name: events.name, isFrozen: events.isFrozen, orgType: organizations.orgType })
      .from(events)
      .leftJoin(organizations, eq(organizations.id, events.organizationId))
      .where(eq(events.id, eventId));
    if (!event) throw new Error("Event not found");
    if (event.isFrozen) throw new EventMetricsFrozenError();

    const rows = await fetchEligibilityRows(items.map((m) => m.metricCode), tx);
    const skipped: BulkAddResult["skipped"] = [];
    const toAdd: BulkAddItem[] = [];
    for (const item of items) {
      const reason = ineligibleReason(rows.get(item.metricCode), event.orgType);
      if (reason) skipped.push({ metricCode: item.metricCode, reason });
      else toAdd.push(item);
    }

    const inserted = toAdd.length
      ? await tx
          .insert(eventMetrics)
          .values(
            toAdd.map((m, i) => ({
              eventId,
              metricCode: m.metricCode,
              displayOrder: m.displayOrder ?? 999 + i,
              isRequired: m.isRequired ?? false,
              customLabel: m.customLabel ?? null,
            }))
          )
          .onConflictDoNothing({ target: [eventMetrics.eventId, eventMetrics.metricCode] })
          .returning({ code: eventMetrics.metricCode })
      : [];
    const insertedCodes = new Set(inserted.map((r) => r.code));
    const added = toAdd.filter((m) => insertedCodes.has(m.metricCode)).map((m) => m.metricCode);

    if (added.length > 0) {
      await tx.insert(auditLogs).values({
        userId,
        action: "event_metrics_bulk_added",
        resourceType: "event",
        resourceId: eventId,
        details: JSON.stringify({ eventName: event.name, metricsAdded: added, count: added.length }),
      });
    }
    return { added, alreadyPresent: toAdd.filter((m) => !insertedCodes.has(m.metricCode)).map((m) => m.metricCode), skipped };
  });
}
