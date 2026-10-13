/**
 * Shared report creation for POST /api/reports and POST /api/events/:eventId/reports.
 * Callers authorize first; this fans an individual report out to one row per athlete,
 * validates the athletes, and rolls back a partial batch.
 */

import { inArray } from "drizzle-orm";
import { db } from "../db";
import { reports, users, type InsertReport, type Report } from "@shared/schema";

export class ReportCreateError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: Record<string, unknown>
  ) {
    super(String(body.message));
  }
}

interface IndividualConfig {
  athleteId?: string;
  athleteIds?: string[];
  [key: string]: unknown;
}

export type CreateReportsResult =
  | { kind: "single"; report: Report }
  | { kind: "batch"; reports: Array<Report & { athleteId: string; athleteName: string }> };

export async function createReportsFromInput(
  userId: string,
  data: InsertReport
): Promise<CreateReportsResult> {
  const config = data.config as IndividualConfig;
  const isIndividual =
    data.reportType === "individual" &&
    typeof config === "object" &&
    config !== null &&
    ("athleteId" in config || "athleteIds" in config);
  const athleteIds = isIndividual ? config.athleteIds : undefined;

  const row = (name: string, rowConfig: unknown) => ({
    name,
    organizationId: data.organizationId,
    reportType: data.reportType,
    config: rowConfig,
    description: data.description,
    isTemplate: data.isTemplate || false,
    createdBy: userId,
  });

  if (Array.isArray(athleteIds) && athleteIds.length > 0) {
    const athletes = await db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(inArray(users.id, athleteIds));

    if (athletes.length !== athleteIds.length) {
      const found = new Set(athletes.map((a) => a.id));
      throw new ReportCreateError(400, {
        message: "Some athlete IDs are invalid",
        missingIds: athleteIds.filter((id) => !found.has(id)),
      });
    }

    const names = new Map(athletes.map((a) => [a.id, a.fullName]));
    const created: Array<Report & { athleteId: string; athleteName: string }> = [];

    try {
      for (const athleteId of athleteIds) {
        const athleteName = names.get(athleteId) || "Unknown Athlete";
        const { athleteIds: _drop, ...rest } = config;
        const [report] = await db
          .insert(reports)
          .values(row(`${data.name} - ${athleteName}`, { ...rest, athleteId }) as any)
          .returning();
        created.push({ ...report, athleteId, athleteName });
      }
    } catch (error) {
      if (created.length > 0) {
        await db.delete(reports).where(inArray(reports.id, created.map((r) => r.id)));
      }
      throw error;
    }

    return { kind: "batch", reports: created };
  }

  if (isIndividual && "athleteIds" in config) {
    throw new ReportCreateError(400, {
      message: "Individual reports require at least one athlete",
    });
  }

  const [report] = await db
    .insert(reports)
    .values(row(data.name, data.config) as any)
    .returning();
  return { kind: "single", report };
}
