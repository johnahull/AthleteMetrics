/**
 * Athlete coaching notes (AM-FEAT-025)
 *
 * SECURITY MODEL:
 * - Only writers (coach / org_admin / site admin) of the NOTE's organization may read or write a note. Athletes and
 *   parents never see notes. The role is always the caller's role in that organization (getOrgRole), never
 *   session.user.role, which is only the role in the caller's first organization.
 * - A caller who may not see a note gets 404, so a note's existence is not revealed.
 * - Edit: the author only. Delete: the author, an org admin of the note's organization, or a site admin.
 */

import type { Express, Response } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { storage } from "../storage";
import { requireAuth, type AuthenticatedRequest } from "../middleware";
import { athleteNotes, events, organizations, users } from "@shared/schema";
import { athleteNoteCreateSchema, athleteNoteUpdateSchema } from "@shared/athlete-notes";
import { getOrgRole, isMeasurementWriterRole } from "../permissions/measurement-helpers";
import { writerOrgIds } from "./report-coach-notes-access";

const NOT_FOUND = { message: "Note not found" };

/** The only part of a membership row this route reads (storage.getUserOrganizations is typed any[]) */
type Membership = { organizationId: string };
const uuid = z.string().uuid();

/** An event may be linked only when it belongs to the note's own organization (a null-org event never matches). */
async function eventInOrganization(eventId: string, organizationId: string): Promise<boolean> {
  const [event] = await db.select({ organizationId: events.organizationId }).from(events).where(eq(events.id, eventId));
  return event?.organizationId === organizationId;
}

function sendError(res: Response, error: unknown, what: string) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ message: "Invalid note", errors: error.errors });
  }
  console.error(`${what} error:`, error);
  return res.status(500).json({ message: `An error occurred while ${what}` });
}

export function registerAthleteNoteRoutes(app: Express) {
  // Notes about an athlete, from every organization where the viewer is a writer
  app.get("/api/athletes/:athleteId/notes", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.session.user!;
      const athleteId = uuid.safeParse(req.params.athleteId);
      if (!athleteId.success) return res.status(404).json(NOT_FOUND);

      // The athlete's organizations, plus any organization they have left but that still holds notes (history)
      const memberships = (await storage.getUserOrganizations(athleteId.data)) ?? [];
      const noted = await db.selectDistinct({ organizationId: athleteNotes.organizationId })
        .from(athleteNotes).where(eq(athleteNotes.athleteId, athleteId.data));
      const writers = await writerOrgIds(user, [...memberships.map((m: Membership) => m.organizationId), ...noted.map((n) => n.organizationId)]);
      if (writers.size === 0) return res.status(404).json(NOT_FOUND);

      const rows = await db.select({
        id: athleteNotes.id,
        athleteId: athleteNotes.athleteId,
        organizationId: athleteNotes.organizationId,
        organizationName: organizations.name,
        authorId: athleteNotes.authorId,
        authorName: users.fullName,
        eventId: athleteNotes.eventId,
        eventName: events.name,
        category: athleteNotes.category,
        flagged: athleteNotes.flagged,
        observedOn: athleteNotes.observedOn,
        body: athleteNotes.body,
        createdAt: athleteNotes.createdAt,
        updatedAt: athleteNotes.updatedAt,
      })
        .from(athleteNotes)
        .innerJoin(organizations, eq(organizations.id, athleteNotes.organizationId))
        .leftJoin(users, eq(users.id, athleteNotes.authorId))
        .leftJoin(events, eq(events.id, athleteNotes.eventId))
        .where(and(eq(athleteNotes.athleteId, athleteId.data), inArray(athleteNotes.organizationId, [...writers])))
        .orderBy(desc(athleteNotes.flagged), desc(athleteNotes.observedOn), desc(athleteNotes.createdAt));

      // Where a note can be added: the athlete's CURRENT organizations in which the viewer is a writer (POST requires membership)
      const current = new Set(memberships.map((m: Membership) => m.organizationId));
      const writableIds = [...writers].filter((id) => current.has(id));
      const writableOrganizations = writableIds.length === 0
        ? []
        : await db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(inArray(organizations.id, writableIds));

      res.json({ notes: rows, writableOrganizations });
    } catch (error) {
      sendError(res, error, "fetching notes");
    }
  });

  app.post("/api/athletes/:athleteId/notes", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.session.user!;
      const athleteId = uuid.safeParse(req.params.athleteId);
      if (!athleteId.success) return res.status(404).json(NOT_FOUND);
      const input = athleteNoteCreateSchema.parse(req.body);

      if (!isMeasurementWriterRole(await getOrgRole(user, input.organizationId))) return res.status(404).json(NOT_FOUND);
      const memberships = (await storage.getUserOrganizations(athleteId.data)) ?? [];
      if (!memberships.some((m: Membership) => m.organizationId === input.organizationId)) return res.status(404).json(NOT_FOUND);
      if (input.eventId && !(await eventInOrganization(input.eventId, input.organizationId))) {
        return res.status(400).json({ message: "Event does not belong to this organization" });
      }

      const [note] = await db.insert(athleteNotes).values({ ...input, athleteId: athleteId.data, authorId: user.id }).returning();
      res.status(201).json({ note });
    } catch (error) {
      sendError(res, error, "creating the note");
    }
  });

  app.patch("/api/athlete-notes/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.session.user!;
      const id = uuid.safeParse(req.params.id);
      if (!id.success) return res.status(404).json(NOT_FOUND);
      const [note] = await db.select().from(athleteNotes).where(eq(athleteNotes.id, id.data));
      if (!note || !isMeasurementWriterRole(await getOrgRole(user, note.organizationId))) return res.status(404).json(NOT_FOUND);
      // They can already see the note, so 403 reveals nothing. A note whose author account is gone (author_id null) matches
      // nobody, so it can no longer be edited by anyone; an org admin can still delete it.
      if (note.authorId !== user.id) return res.status(403).json({ message: "Only the author can edit a note" });

      const input = athleteNoteUpdateSchema.parse(req.body);
      if (input.eventId && !(await eventInOrganization(input.eventId, note.organizationId))) {
        return res.status(400).json({ message: "Event does not belong to this organization" });
      }

      const [updated] = await db.update(athleteNotes).set({ ...input, updatedAt: new Date() })
        .where(eq(athleteNotes.id, note.id)).returning();
      // Deleted by someone else between the read above and this update
      if (!updated) return res.status(404).json(NOT_FOUND);
      res.json({ note: updated });
    } catch (error) {
      sendError(res, error, "updating the note");
    }
  });

  app.delete("/api/athlete-notes/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.session.user!;
      const id = uuid.safeParse(req.params.id);
      if (!id.success) return res.status(404).json(NOT_FOUND);
      const [note] = await db.select().from(athleteNotes).where(eq(athleteNotes.id, id.data));
      const role = note ? await getOrgRole(user, note.organizationId) : undefined;
      if (!note || !isMeasurementWriterRole(role)) return res.status(404).json(NOT_FOUND);
      if (note.authorId !== user.id && role !== "org_admin" && role !== "site_admin") {
        return res.status(403).json({ message: "Only the author, an organization admin or a site admin can delete a note" });
      }

      await db.delete(athleteNotes).where(eq(athleteNotes.id, note.id));
      res.status(204).end();
    } catch (error) {
      sendError(res, error, "deleting the note");
    }
  });
}
