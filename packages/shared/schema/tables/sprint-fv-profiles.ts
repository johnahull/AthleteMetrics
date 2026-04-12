/**
 * Sprint Force-Velocity Profile Tables
 *
 * Stores computed JB Morin sprint F-V profiles derived from existing
 * split time measurements (DASH_5YD, DASH_10YD, DASH_20YD, DASH_30YD).
 */

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, decimal, timestamp, date, jsonb, index } from "drizzle-orm/pg-core";

/**
 * Split times stored as JSON: distance (string) → time in seconds
 * e.g., { "5": 1.12, "10": 1.83, "20": 3.21, "30": 4.52 }
 */
export type SplitTimesJson = Record<string, number>;

/**
 * Per-split residual: predicted vs observed distance
 */
export interface FitResidual {
  distance: number;
  observedTime: number;
  predictedTime: number;
  residual: number;
}

/**
 * Analysis stored as JSON on the profile
 */
export interface SprintFvAnalysisJson {
  classification: {
    classification: 'force-deficit' | 'velocity-deficit' | 'well-balanced';
    imbalancePercent: number;
    dominantQuality: 'force' | 'velocity' | 'balanced';
    trainingRecommendations: string[];
    explanation: string;
  };
  optimalGap: {
    optimalF0: number;
    optimalV0: number;
    optimalSlope: number;
    f0Gap: number;
    v0Gap: number;
    f0GapPercent: number;
    v0GapPercent: number;
    estimatedTimeImprovement: number;
    recommendation: string;
  };
  accelerationProfile: {
    tau: number;
    timeTo90Pct: number;
    timeTo95Pct: number;
    accelerationPhaseM: number;
    tauRating: 'explosive' | 'fast' | 'average' | 'slow';
    trainingInsights: string[];
  };
  powerProfile: {
    pmaxRel: number;
    velocityAtPmax: number;
    rfPeak: number;
    rfPeakRating: 'excellent' | 'good' | 'average' | 'poor';
    drf: number;
    drfRating: 'excellent' | 'good' | 'average' | 'poor';
    trainingInsights: string[];
  };
  deltas?: {
    f0Delta: { absolute: number; percent: number; direction: 'improved' | 'declined' | 'stable' };
    v0Delta: { absolute: number; percent: number; direction: 'improved' | 'declined' | 'stable' };
    pmaxDelta: { absolute: number; percent: number; direction: 'improved' | 'declined' | 'stable' };
    slopeDelta: { absolute: number; percent: number; direction: 'improved' | 'declined' | 'stable' };
    rfPeakDelta: { absolute: number; percent: number; direction: 'improved' | 'declined' | 'stable' };
    drfDelta: { absolute: number; percent: number; direction: 'improved' | 'declined' | 'stable' };
    overallTrend: string;
    alerts: string[];
    daysBetweenSessions: number;
  };
}

export const sprintFvProfiles = pgTable("sprint_fv_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Historical reference fields - NO foreign key constraints (matches measurements pattern)
  userId: varchar("user_id").notNull(),
  submittedBy: varchar("submitted_by").notNull(),
  organizationId: varchar("organization_id"),
  teamId: varchar("team_id"),
  teamNameSnapshot: text("team_name_snapshot"),
  // Session data
  date: date("date").notNull(),
  bodyMassKg: decimal("body_mass_kg", { precision: 6, scale: 2 }).notNull(),
  distanceUnit: text("distance_unit").notNull(), // 'yards' or 'meters'
  splitTimesJson: jsonb("split_times_json").$type<SplitTimesJson>().notNull(),
  // Source measurement provenance
  sourceMeasurementIds: text("source_measurement_ids").array().notNull(),
  weightMeasurementId: varchar("weight_measurement_id"),
  eventId: varchar("event_id"),
  // Fitted model parameters
  vmax: decimal("vmax", { precision: 10, scale: 4 }),
  tau: decimal("tau", { precision: 10, scale: 4 }),
  // Derived biomechanical outputs
  f0Rel: decimal("f0_rel", { precision: 10, scale: 4 }),
  v0: decimal("v0", { precision: 10, scale: 4 }),
  pmaxRel: decimal("pmax_rel", { precision: 10, scale: 4 }),
  fvSlope: decimal("fv_slope", { precision: 10, scale: 6 }),
  rfPeak: decimal("rf_peak", { precision: 10, scale: 4 }),
  drf: decimal("drf", { precision: 10, scale: 6 }),
  // Model fit quality
  fitR2: decimal("fit_r2", { precision: 6, scale: 4 }),
  fitResiduals: jsonb("fit_residuals").$type<FitResidual[]>(),
  // Analysis (classification, gap, deltas, training recs)
  analysisJson: jsonb("analysis_json").$type<SprintFvAnalysisJson>(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userDateIdx: index("sprint_fv_profiles_user_date_idx").on(table.userId, table.date),
  orgIdx: index("sprint_fv_profiles_org_idx").on(table.organizationId),
  eventIdx: index("sprint_fv_profiles_event_idx").on(table.eventId),
}));
