/**
 * Measurements Tables
 *
 * measurements, peerPercentileCache
 */

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, date, boolean, unique, index, jsonb, time } from "drizzle-orm/pg-core";
import { organizations, teams, users } from "./core";
import { siteMetrics } from "./metrics";

export const measurements = pgTable("measurements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Historical reference fields - NO foreign key constraints
  // These are immutable snapshots in time that may reference deleted users
  userId: varchar("user_id").notNull(), // Athlete - historical reference (no FK)
  submittedBy: varchar("submitted_by").notNull(), // Who recorded it - historical reference (no FK)
  verifiedBy: varchar("verified_by"), // Who verified it - historical reference (no FK)
  isVerified: boolean("is_verified").default(false).notNull(),
  date: date("date").notNull(),
  age: integer("age").notNull(), // User's age at time of measurement
  metric: text("metric").notNull(), // "FLY10_TIME", "VERTICAL_JUMP", "AGILITY_505", "AGILITY_5105", "T_TEST", "DASH_40YD", "RSI", "TOP_SPEED"
  value: decimal("value", { precision: 10, scale: 3 }).notNull(),
  units: text("units").notNull(), // "s" or "in"
  flyInDistance: decimal("fly_in_distance", { precision: 10, scale: 3 }), // Optional yards for FLY10_TIME
  auxiliaryValue: decimal("auxiliary_value", { precision: 10, scale: 3 }), // Secondary input for paired-input metrics (e.g., reps for 1RM-est)
  notes: text("notes"),
  // Team context fields - immutable snapshot of team at time of measurement
  // IMPORTANT: teamId is historical reference WITHOUT foreign key constraint
  // This allows measurements to retain team context even after team deletion/rename
  teamId: varchar("team_id"), // Team ID at time of measurement (no FK - historical reference like userId)
  teamNameSnapshot: text("team_name_snapshot"), // Team name at time of measurement (immutable)
  organizationId: varchar("organization_id"), // Organization ID at time of measurement (no FK - historical reference)
  season: text("season"), // Season designation (e.g., "2024-Fall")
  teamContextAuto: boolean("team_context_auto").default(true).notNull(), // Whether team was auto-assigned vs manually selected
  // Global athlete linking for cross-org aggregation
  globalAthleteId: varchar("global_athlete_id"), // Historical reference (no FK - allows orphaned data)
  // Derived/calculated measurement fields
  isCalculated: boolean("is_calculated").default(false).notNull(), // Whether this measurement was auto-calculated
  calculatedFromMeasurementIds: text("calculated_from_measurement_ids").array(), // Source measurement IDs used in calculation
  calculationMetadata: jsonb("calculation_metadata").$type<{
    formula: string;
    sourceValues: Record<string, number>;
    calculatedAt: string;
    calculationVersion?: string;  // Version of the calculator (e.g., "1.0.0")
    parentMetric?: string;  // For splits: the parent drill metric this split belongs to (e.g., "DASH_30YD")
    triggeredBy?: {
      event: 'measurement_insert' | 'measurement_update' | 'measurement_delete' | 'manual_recalculation' | 'bulk_import';
      userId?: string;              // Who triggered the calculation (if applicable)
      sourceMeasurementId?: string; // Source measurement that triggered the calculation
    };
  }>(),
  // Device import tracking
  importSource: varchar("import_source", { length: 50 }), // "dashr_csv", "ovr_csv", etc.
  importBatchId: varchar("import_batch_id"), // References import_batches.id (no FK — historical reference)
  // Event context - immutable snapshot at measurement time (no FK - historical reference)
  eventId: varchar("event_id"), // Event ID when measurement was taken at an event
  eventNameSnapshot: text("event_name_snapshot"), // Event name at time of measurement
  eventDateSnapshot: date("event_date_snapshot"), // Event date at time of measurement
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  globalAthleteIdx: index("measurements_global_athlete_idx").on(table.globalAthleteId, table.date),
  // Performance indexes for peer comparison queries
  metricVerifiedIdx: index("measurements_metric_verified_idx").on(table.metric, table.isVerified, table.userId, table.value),
  userMetricDateIdx: index("measurements_user_metric_date_idx").on(table.userId, table.metric, table.date),
  // Event-based measurement queries (added in migration 0081)
  eventIdx: index("measurements_event_idx").on(table.eventId, table.date),
  // Device import batch lookups (for rollback)
  importBatchIdx: index("measurements_import_batch_idx").on(table.importBatchId),
  // Derived metrics indexes (partial indexes: WHERE is_calculated = true / is_verified = true)
  isCalculatedIdx: index("idx_measurements_is_calculated").on(table.isCalculated).where(sql`${table.isCalculated} = true`),
  // Note: idx_measurements_calculated_from is a GIN index (USING GIN) created in migration 0083
  // for array containment queries on calculated_from_measurement_ids. Drizzle doesn't support
  // specifying GIN index type, so this index is created manually in the migration.
  // Index name: idx_measurements_calculated_from (partial: WHERE is_calculated = true)
  userMetricVerifiedDateIdx: index("idx_measurements_user_metric_verified_date").on(table.userId, table.metric, table.date).where(sql`${table.isVerified} = true`),
}));

export const peerPercentileCache = pgTable("peer_percentile_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  metricCode: varchar("metric_code", { length: 50 }).notNull().references(() => siteMetrics.code, { onDelete: 'cascade' }),
  filterCriteria: jsonb("filter_criteria").$type<{
    ageRange?: [number, number];
    gender?: 'Male' | 'Female';
    orgTypes?: string[];
    sports?: string[];
  }>().notNull().default({}),
  // Hash of filterCriteria for deterministic lookups (avoids JSONB key ordering issues)
  // NOTE: MD5 is used for cache key generation (performance), NOT cryptographic security
  // JSONB objects {"age": 18, "gender": "M"} and {"gender": "M", "age": 18} have different ::text representations
  // Using MD5 hash ensures consistent lookups regardless of key ordering
  filterHash: varchar("filter_hash", { length: 64 }).generatedAlwaysAs(sql`md5(filter_criteria::text)`),
  // Distribution data
  sampleSize: integer("sample_size").notNull(),
  p10: decimal("p10", { precision: 10, scale: 4 }),
  p25: decimal("p25", { precision: 10, scale: 4 }),
  p50: decimal("p50", { precision: 10, scale: 4 }),
  p75: decimal("p75", { precision: 10, scale: 4 }),
  p90: decimal("p90", { precision: 10, scale: 4 }),
  mean: decimal("mean", { precision: 10, scale: 4 }),
  // Cache metadata
  computedAt: timestamp("computed_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
}, (table) => ({
  metricIdx: index("peer_percentile_cache_metric_idx").on(table.metricCode),
  expiresIdx: index("peer_percentile_cache_expires_idx").on(table.expiresAt),
  // Unique constraint on metric + filter hash for upsert operations (more reliable than JSONB)
  uniqueMetricFilterHash: unique("peer_percentile_cache_metric_hash_unique").on(table.metricCode, table.filterHash),
}));