/**
 * Waiver Tables
 *
 * waiverSubmissions tracks intake of athlete waivers received via external
 * webhooks (currently Jotform). Each Jotform submission is persisted with
 * its raw payload for replay/recovery, and idempotency is enforced via the
 * unique submissionId column.
 *
 * Parent/guardian information is intentionally stored as denormalized fields
 * on this table rather than as a separate domain — this is a vertical slice
 * for the issue #370 webhook intake. A dedicated parent/guardian domain can
 * be extracted later if/when other features require it.
 */

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, date, jsonb, index } from "drizzle-orm/pg-core";
import { waiverSubmissionStatusEnum } from "../enums";
import { users } from "./core";

export const waiverSubmissions = pgTable("waiver_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // External submission identifier from Jotform (used for idempotency)
  submissionId: text("submission_id").notNull().unique(),
  // Optional Jotform form id (so multiple waiver forms can be distinguished later)
  formId: text("form_id"),
  source: text("source").default("jotform").notNull(),
  // Athlete the waiver pertains to (set after we create or match the user)
  athleteUserId: varchar("athlete_user_id").references(() => users.id, { onDelete: "set null" }),
  athleteEmail: text("athlete_email"),
  athleteFirstName: text("athlete_first_name"),
  athleteLastName: text("athlete_last_name"),
  athleteBirthDate: date("athlete_birth_date"),
  // Parent/guardian fields stored inline (no dedicated domain yet)
  parentName: text("parent_name"),
  parentEmail: text("parent_email"),
  parentPhone: text("parent_phone"),
  // Waiver document metadata. We persist the Jotform-hosted PDF URL today;
  // actually downloading and re-hosting the PDF binary is intentionally
  // deferred — see TODO in waiver-service.ts.
  pdfUrl: text("pdf_url"),
  signedAt: timestamp("signed_at"),
  // Lifecycle
  status: text("status", { enum: waiverSubmissionStatusEnum }).default("received").notNull(),
  errorMessage: text("error_message"),
  // Full raw payload (Jotform `rawRequest` parsed JSON plus envelope) for
  // manual recovery if processing fails partway through.
  rawPayload: jsonb("raw_payload").notNull(),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  athleteUserIdx: index("waiver_submissions_athlete_user_id_idx").on(table.athleteUserId),
  athleteEmailIdx: index("waiver_submissions_athlete_email_idx").on(table.athleteEmail),
  statusIdx: index("waiver_submissions_status_idx").on(table.status),
  createdAtIdx: index("waiver_submissions_created_at_idx").on(table.createdAt),
}));

export type WaiverSubmission = typeof waiverSubmissions.$inferSelect;
export type InsertWaiverSubmission = typeof waiverSubmissions.$inferInsert;
