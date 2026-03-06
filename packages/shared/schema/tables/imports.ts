/**
 * Import Batches Table
 *
 * Tracks device data imports (Dashr, OVR, etc.) with server-side
 * parsed preview storage for review-then-commit workflow.
 */

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { organizations } from "./core";

export const importBatches = pgTable("import_batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),

  // Import metadata
  source: varchar("source", { length: 50 }).notNull(), // "dashr_csv", "ovr_csv", etc.
  fileName: varchar("file_name", { length: 255 }).notNull(),
  sessionDate: text("session_date"), // Selected session date from multi-session CSV

  // Event linkage (optional — standalone imports have null eventId)
  eventId: varchar("event_id"), // Historical reference (no FK — event may be deleted)
  eventNameSnapshot: text("event_name_snapshot"),

  // Server-side parsed preview (cleared after commit)
  parsedPreview: jsonb("parsed_preview").$type<{
    athletes: Array<{
      csvName: string;
      firstName: string;
      lastName: string;
      matchedAthleteId?: string;
      matchType: 'exact' | 'fuzzy' | 'partial' | 'none';
      matchConfidence: number;
      alternatives?: Array<{ id: string; firstName: string; lastName: string; score: number }>;
      drills: Array<{
        metric: string;
        value: number;
        units: string;
        splits?: Array<{ metric: string; value: number; units: string }>;
        isOutlier?: boolean;
        outlierReason?: string;
      }>;
      included: boolean;
    }>;
    summary: {
      totalAthletes: number;
      exactMatches: number;
      fuzzyMatches: number;
      unmatched: number;
      totalDrills: number;
      outlierCount: number;
    };
  }>(),

  // Status tracking
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, completed, rolled_back, expired
  createdBy: varchar("created_by").notNull(), // User who initiated the import
  committedBy: varchar("committed_by"), // User who confirmed the import
  committedAt: timestamp("committed_at"),
  rolledBackBy: varchar("rolled_back_by"),
  rolledBackAt: timestamp("rolled_back_at"),

  // Result counts (populated after commit)
  measurementsCreated: integer("measurements_created"),
  measurementsSkipped: integer("measurements_skipped"),
  measurementsReplaced: integer("measurements_replaced"),
  athletesImported: integer("athletes_imported"),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(), // 30-min TTL for pending batches
}, (table) => ({
  orgIdx: index("import_batches_org_idx").on(table.organizationId),
  statusIdx: index("import_batches_status_idx").on(table.status),
  createdAtIdx: index("import_batches_created_at_idx").on(table.createdAt),
}));
