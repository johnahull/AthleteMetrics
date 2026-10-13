/**
 * Shared report creation for POST /api/reports and POST /api/events/:eventId/reports.
 * Callers authorize first; this fans an individual report out to one row per athlete,
 * checks that each athlete belongs to the report's organization, and writes the rows in
 * one statement so a batch is all-or-nothing.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { reports, users, userOrganizations, type InsertReport, type Report } from "@shared/schema";

// Matches the athlete picker's "Select All" cap in the web app; bounds the multi-row insert
export const MAX_REPORT_ATHLETES = 200;

export class ReportCreateError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: Record<string, unknown>
  ) {
    super(String(body.message));
  }
}

export type CreateReportsResult =
  | { kind: "single"; report: Report }
  | { kind: "batch"; reports: Array<Report & { athleteId: string; athleteName: string }> };

export async function createReportsFromInput(
  userId: string,
  data: InsertReport
): Promise<CreateReportsResult> {
  const row = (name: string, config: InsertReport["config"]) => ({
    name,
    organizationId: data.organizationId,
    reportType: data.reportType,
    config,
    description: data.description,
    isTemplate: data.isTemplate || false,
    createdBy: userId,
  });

  if (data.reportType !== "individual") {
    const [report] = await db.insert(reports).values(row(data.name, data.config)).returning();
    return { kind: "single", report };
  }

  const { athleteIds: listed, athleteId, ...rest } = data.config;
  const athleteIds = [...new Set(listed?.length ? listed : athleteId ? [athleteId] : [])];
  if (athleteIds.length === 0) {
    throw new ReportCreateError(400, { message: "Individual reports require at least one athlete" });
  }
  if (athleteIds.length > MAX_REPORT_ATHLETES) {
    throw new ReportCreateError(400, {
      message: `At most ${MAX_REPORT_ATHLETES} athletes per request`,
    });
  }

  // Only members of the report's organization: no cross-org names or report rows
  const athletes = await db
    .select({ id: users.id, fullName: users.fullName })
    .from(users)
    .innerJoin(userOrganizations, eq(userOrganizations.userId, users.id))
    .where(and(inArray(users.id, athleteIds), eq(userOrganizations.organizationId, data.organizationId)));

  if (athletes.length !== athleteIds.length) {
    const found = new Set(athletes.map((a) => a.id));
    throw new ReportCreateError(400, {
      message: "Some athlete IDs are invalid",
      missingIds: athleteIds.filter((id) => !found.has(id)),
    });
  }

  const names = new Map(athletes.map((a) => [a.id, a.fullName]));
  const created = await db
    .insert(reports)
    .values(
      athleteIds.map((id) =>
        row(`${data.name} - ${names.get(id) || "Unknown Athlete"}`, { ...rest, athleteId: id })
      )
    )
    .returning();

  // Read the athlete back from each row instead of relying on RETURNING order
  return {
    kind: "batch",
    reports: created.map((report) => {
      const athleteId = (report.config as { athleteId: string }).athleteId;
      return { ...report, athleteId, athleteName: names.get(athleteId) || "Unknown Athlete" };
    }),
  };
}
