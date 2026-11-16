/**
 * Athlete Coaching Notes (AM-FEAT-025)
 *
 * athleteNotes: dated, organization-scoped observations a coach keeps about an athlete.
 * Visible only to writers (coach / org_admin / site admin) of the note's organization.
 * CASCADE on athlete and organization: deleteAthlete, hardDeleteUser and deleteOrganization hard-delete those
 * rows, which a plain FK would block. The SQL migration (0184) must match this definition exactly.
 */

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, date, boolean, index } from "drizzle-orm/pg-core";
import { organizations, users } from "./core";
import { events } from "./events";
import { ATHLETE_NOTE_CATEGORIES } from "../../athlete-notes";

export const athleteNotes = pgTable("athlete_notes", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  athleteId: varchar("athlete_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
  authorId: varchar("author_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  eventId: varchar("event_id", { length: 36 }).references(() => events.id, { onDelete: "set null" }),
  category: text("category", { enum: ATHLETE_NOTE_CATEGORIES }),
  // Pins the note to the top (e.g. an active restriction)
  flagged: boolean("flagged").default(false).notNull(),
  // No DB default: the client sends the coach's local date
  observedOn: date("observed_on").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  athleteOrgObservedIdx: index("athlete_notes_athlete_org_observed_idx").on(table.athleteId, table.organizationId, table.observedOn),
}));

export type AthleteNote = typeof athleteNotes.$inferSelect;
export type InsertAthleteNote = typeof athleteNotes.$inferInsert;
