import { inArray } from "drizzle-orm";
import { db } from "../db";
import { getPgError, PG_UNIQUE_VIOLATION } from "../lib/pg-error";
import { benchmarkDistributions, benchmarkDistributionVersions, siteMetrics } from "@shared/schema";
import type { CreateBenchmarkDistributionInput } from "@shared/benchmark-distribution-schemas";

/** Create-only by design: there is no update or delete path. Mirrors the 0179 trigger and checks, which db:push DBs lack. */
const LABEL_CONSTRAINT = "benchmark_distribution_versions_label_uniq";
export class DistributionInputError extends Error {}
export class DuplicateVersionLabelError extends Error {}

export async function createDistributionVersion(input: CreateBenchmarkDistributionInput, userId: string) {
  try {
    return await db.transaction(async (tx) => {
      const codes = Array.from(new Set(input.distributions.map((d) => d.metricCode)));
      const metrics = await tx.select({ code: siteMetrics.code, metricType: siteMetrics.metricType }).from(siteMetrics).where(inArray(siteMetrics.code, codes))
        .for("share"); // a concurrent metric delete waits, so it cannot slip in before the insert
      const byCode = new Map(metrics.map((m) => [m.code, m.metricType]));
      for (const code of codes) {
        const type = byCode.get(code);
        if (!type) throw new DistributionInputError(`Unknown metric code: ${code}`);
        if (type === "tracking") throw new DistributionInputError(`Metric ${code} is a tracking metric and has no better/worse direction`);
      }
      const [version] = await tx
        .insert(benchmarkDistributionVersions)
        .values({ label: input.label, source: input.source, notes: input.notes, createdBy: userId })
        .returning({ id: benchmarkDistributionVersions.id });
      await tx.insert(benchmarkDistributions).values(
        input.distributions.map((d) => ({ ...d, versionId: version.id, values: [...d.values].sort((a, b) => a - b) })),
      );
      return { versionId: version.id, rows: input.distributions.length };
    });
  } catch (e: any) {
    // postgres.js names the field constraint_name, node-postgres/neon constraint. Only the label constraint is a duplicate label; the transaction already rolled back
    const pg = getPgError(e);
    if (pg?.code === PG_UNIQUE_VIOLATION && (pg.constraint ?? pg.constraint_name) === LABEL_CONSTRAINT) throw new DuplicateVersionLabelError("A distribution version with this label already exists");
    throw e;
  }
}
