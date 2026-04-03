/**
 * Parent Link Request Routes — Phase 3 of Link-a-Child workflow
 *
 * Endpoints:
 *  POST   /api/parent/link-requests               — parent initiates request (anti-enumeration)
 *  GET    /api/parent/link-requests               — parent lists their requests
 *  DELETE /api/parent/link-requests/:id           — parent cancels a pending request
 *  GET    /api/coach/parent-link-requests         — coach views pending requests for their org
 *  POST   /api/coach/parent-link-requests/:id/approve — coach approves
 *  POST   /api/coach/parent-link-requests/:id/deny    — coach denies
 *
 * Security notes:
 *  - POST /api/parent/link-requests uses anti-enumeration: always 200 regardless of
 *    whether the child identifier resolves to a real user.
 *  - Coach endpoints verify the coach belongs to the same org as the request,
 *    OR the user is a site admin.
 *  - Expired requests (expiresAt < now) are filtered from the coach view.
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { eq, and, inArray, gt } from "drizzle-orm";
import { db } from "../db";
import { requireAuth } from "../middleware";
import { isSiteAdmin } from "@shared/auth-utils";
import { parentAthleteLinks, parentLinkRequests } from "@shared/schema/tables/coppa";
import { userOrganizations } from "@shared/schema/tables/membership";
import { users } from "@shared/schema/tables/core";
import { storage } from "../storage";
import { emailService } from "../services/email-service";
import { ROLE_HIERARCHY } from "../permissions/types";
import { shouldSkipRateLimiting } from "../utils/rate-limit-utils";

/** Minimum role level for coach access. */
const COACH_LEVEL = ROLE_HIERARCHY['coach'];

/**
 * Check whether the session user has at least coach-level role in any org,
 * OR is a site admin. Returns true if the user may access coach endpoints.
 */
async function hasCoachAccess(userId: string, isSiteAdminUser: boolean): Promise<boolean> {
  if (isSiteAdminUser) return true;
  const memberships = await db
    .select({ role: userOrganizations.role })
    .from(userOrganizations)
    .where(eq(userOrganizations.userId, userId));
  return memberships.some(m => {
    const level = ROLE_HIERARCHY[m.role as keyof typeof ROLE_HIERARCHY];
    return level !== undefined && level >= COACH_LEVEL;
  });
}

/**
 * Get all organization IDs where the user has at least coach-level access.
 */
async function getCoachOrgIds(userId: string): Promise<string[]> {
  const memberships = await db
    .select({ role: userOrganizations.role, orgId: userOrganizations.organizationId })
    .from(userOrganizations)
    .where(eq(userOrganizations.userId, userId));
  return memberships
    .filter(m => {
      const level = ROLE_HIERARCHY[m.role as keyof typeof ROLE_HIERARCHY];
      return level !== undefined && level >= COACH_LEVEL;
    })
    .map(m => m.orgId);
}

const ANTI_ENUM_MESSAGE = "If this user exists, your request has been submitted.";

export function registerParentLinkRequestRoutes(app: Express) {

  const linkRequestLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 10,
    keyGenerator: (req) => req.session?.user?.id ?? req.ip ?? 'unknown',
    skip: (req) => shouldSkipRateLimiting(req, 'general'),
    message: { success: false, message: "Too many link requests. Please try again later." },
  });

  // ==========================================================================
  // POST /api/parent/link-requests
  // Anti-enumeration: always returns 200 with a generic message.
  // ==========================================================================
  app.post("/api/parent/link-requests", requireAuth, linkRequestLimiter, async (req, res) => {
    try {
      const sessionUser = req.session.user;
      if (!sessionUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Only parent accounts (or site admins) can submit link requests
      if (!isSiteAdmin(sessionUser)) {
        // Check user has parent role in at least one org, or is a standalone parent
        const memberships = await db
          .select({ role: userOrganizations.role })
          .from(userOrganizations)
          .where(eq(userOrganizations.userId, sessionUser.id));
        const isParent = memberships.some(m => m.role === 'parent');
        if (!isParent) {
          return res.status(403).json({ message: "Only parent accounts can submit link requests" });
        }
      }

      const parentUserId = sessionUser.id;

      const { childIdentifier } = req.body as { childIdentifier?: string };
      if (!childIdentifier || typeof childIdentifier !== 'string') {
        // Still return generic 200 to avoid leaking info
        return res.status(200).json({ success: true, message: ANTI_ENUM_MESSAGE });
      }

      // Attempt to find child by username, then by email
      let child = await storage.getUserByUsername(childIdentifier.trim());
      if (!child) {
        child = await storage.getUserByEmail(childIdentifier.trim()) ?? undefined;
      }

      // Anti-enumeration: if no child found or not a minor, return generic message silently
      if (!child || !child.isMinor) {
        return res.status(200).json({ success: true, message: ANTI_ENUM_MESSAGE });
      }

      // Check for existing active parentAthleteLinks → skip silently
      const existingLinks = await db
        .select({ id: parentAthleteLinks.id })
        .from(parentAthleteLinks)
        .where(and(
          eq(parentAthleteLinks.parentUserId, parentUserId),
          eq(parentAthleteLinks.athleteUserId, child.id),
          eq(parentAthleteLinks.isActive, true),
        ));
      if (existingLinks.length > 0) {
        return res.status(200).json({ success: true, message: ANTI_ENUM_MESSAGE });
      }

      // Check for existing pending parentLinkRequests → skip silently
      const existingRequests = await db
        .select({ id: parentLinkRequests.id })
        .from(parentLinkRequests)
        .where(and(
          eq(parentLinkRequests.parentUserId, parentUserId),
          eq(parentLinkRequests.athleteUserId, child.id),
          eq(parentLinkRequests.status, 'pending'),
        ));
      if (existingRequests.length > 0) {
        return res.status(200).json({ success: true, message: ANTI_ENUM_MESSAGE });
      }

      // Find child's org (take first membership, if any)
      const [childMembership] = await db
        .select({ organizationId: userOrganizations.organizationId })
        .from(userOrganizations)
        .where(eq(userOrganizations.userId, child.id))
        .limit(1);
      const organizationId = childMembership?.organizationId ?? null;

      // Insert the link request
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await db.insert(parentLinkRequests).values({
        parentUserId,
        athleteUserId: child.id,
        organizationId,
        status: 'pending',
        expiresAt,
      });

      // Fire-and-forget: notify coaches in the org
      if (organizationId) {
        (async () => {
          try {
            const coachMemberships = await db
              .select({ userId: userOrganizations.userId })
              .from(userOrganizations)
              .where(and(
                eq(userOrganizations.organizationId, organizationId),
                inArray(userOrganizations.role, ['coach', 'org_admin']),
              ));
            const coachIds = coachMemberships.map(m => m.userId);
            if (coachIds.length === 0) return;

            const coachRecords = await db
              .select({ emails: users.emails, firstName: users.firstName, lastName: users.lastName })
              .from(users)
              .where(inArray(users.id, coachIds));

            const parentRecord = await storage.getUser(parentUserId);
            const parentName = parentRecord
              ? `${parentRecord.firstName} ${parentRecord.lastName}`.trim()
              : 'A parent';
            const childName = `${child!.firstName} ${child!.lastName}`.trim();

            for (const coach of coachRecords) {
              const coachEmail = coach.emails?.[0];
              if (!coachEmail) continue;
              await emailService.sendParentLinkRequestToCoach({
                to: coachEmail,
                coachName: `${coach.firstName} ${coach.lastName}`.trim(),
                parentName,
                childName,
              });
            }
          } catch (err) {
            console.error('[ParentLinkRequest] Failed to notify coaches:', err);
          }
        })();
      }

      return res.status(200).json({ success: true, message: ANTI_ENUM_MESSAGE });
    } catch (error) {
      console.error('[ParentLinkRequest] POST error:', error);
      return res.status(200).json({ success: true, message: ANTI_ENUM_MESSAGE });
    }
  });

  // ==========================================================================
  // GET /api/parent/link-requests
  // Returns all link requests submitted by the authenticated parent.
  // ==========================================================================
  app.get("/api/parent/link-requests", requireAuth, async (req, res) => {
    try {
      const parentUserId = req.session.user?.id;
      if (!parentUserId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      // Role check omitted here — any user should see their own requests (even if role changed)

      const requests = await db
        .select({
          id: parentLinkRequests.id,
          athleteUserId: parentLinkRequests.athleteUserId,
          organizationId: parentLinkRequests.organizationId,
          status: parentLinkRequests.status,
          denialReason: parentLinkRequests.denialReason,
          createdAt: parentLinkRequests.createdAt,
          expiresAt: parentLinkRequests.expiresAt,
          processedAt: parentLinkRequests.processedAt,
          // Child name fields
          childFirstName: users.firstName,
          childLastName: users.lastName,
        })
        .from(parentLinkRequests)
        .leftJoin(users, eq(parentLinkRequests.athleteUserId, users.id))
        .where(eq(parentLinkRequests.parentUserId, parentUserId));

      return res.json(requests);
    } catch (error) {
      console.error('[ParentLinkRequest] GET list error:', error);
      return res.status(500).json({ message: "Failed to fetch link requests" });
    }
  });

  // ==========================================================================
  // DELETE /api/parent/link-requests/:id
  // Parent cancels their own pending request.
  // ==========================================================================
  app.delete("/api/parent/link-requests/:id", requireAuth, async (req, res) => {
    try {
      const parentUserId = req.session.user?.id;
      if (!parentUserId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { id } = req.params;

      // Verify request exists and belongs to this parent
      const [existing] = await db
        .select()
        .from(parentLinkRequests)
        .where(eq(parentLinkRequests.id, id));

      if (!existing) {
        return res.status(404).json({ message: "Link request not found" });
      }

      if (existing.parentUserId !== parentUserId) {
        return res.status(403).json({ message: "You do not have permission to cancel this request" });
      }

      // Update status to cancelled
      await db
        .update(parentLinkRequests)
        .set({ status: 'cancelled' })
        .where(eq(parentLinkRequests.id, id));

      return res.json({ success: true });
    } catch (error) {
      console.error('[ParentLinkRequest] DELETE error:', error);
      return res.status(500).json({ message: "Failed to cancel link request" });
    }
  });

  // ==========================================================================
  // GET /api/coach/parent-link-requests
  // Coach views pending (non-expired) requests for their org(s).
  // Site admins also see requests with NULL organizationId.
  // ==========================================================================
  app.get("/api/coach/parent-link-requests", requireAuth, async (req, res) => {
    try {
      const sessionUser = req.session.user;
      if (!sessionUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const isAdmin = isSiteAdmin(sessionUser);

      // Check coach access
      const hasAccess = await hasCoachAccess(sessionUser.id, isAdmin);
      if (!hasAccess) {
        return res.status(403).json({ message: "Insufficient permissions for this action" });
      }

      const now = new Date();

      let rows: {
        id: string;
        parentUserId: string;
        athleteUserId: string;
        organizationId: string | null;
        status: string;
        createdAt: Date;
        expiresAt: Date;
      }[];

      if (isAdmin) {
        // Site admin sees all pending non-expired requests (including org-less ones)
        rows = await db
          .select({
            id: parentLinkRequests.id,
            parentUserId: parentLinkRequests.parentUserId,
            athleteUserId: parentLinkRequests.athleteUserId,
            organizationId: parentLinkRequests.organizationId,
            status: parentLinkRequests.status,
            createdAt: parentLinkRequests.createdAt,
            expiresAt: parentLinkRequests.expiresAt,
          })
          .from(parentLinkRequests)
          .where(and(
            eq(parentLinkRequests.status, 'pending'),
            gt(parentLinkRequests.expiresAt, now),
          ));
      } else {
        const orgIds = await getCoachOrgIds(sessionUser.id);
        if (orgIds.length === 0) {
          return res.json([]);
        }

        rows = await db
          .select({
            id: parentLinkRequests.id,
            parentUserId: parentLinkRequests.parentUserId,
            athleteUserId: parentLinkRequests.athleteUserId,
            organizationId: parentLinkRequests.organizationId,
            status: parentLinkRequests.status,
            createdAt: parentLinkRequests.createdAt,
            expiresAt: parentLinkRequests.expiresAt,
          })
          .from(parentLinkRequests)
          .where(and(
            eq(parentLinkRequests.status, 'pending'),
            gt(parentLinkRequests.expiresAt, now),
            inArray(parentLinkRequests.organizationId, orgIds),
          ));
      }

      return res.json(rows);
    } catch (error) {
      console.error('[ParentLinkRequest] GET coach list error:', error);
      return res.status(500).json({ message: "Failed to fetch link requests" });
    }
  });

  // ==========================================================================
  // POST /api/coach/parent-link-requests/:id/approve
  // ==========================================================================
  app.post("/api/coach/parent-link-requests/:id/approve", requireAuth, async (req, res) => {
    try {
      const sessionUser = req.session.user;
      if (!sessionUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const isAdmin = isSiteAdmin(sessionUser);
      const hasAccess = await hasCoachAccess(sessionUser.id, isAdmin);
      if (!hasAccess) {
        return res.status(403).json({ message: "Insufficient permissions for this action" });
      }

      const { id } = req.params;

      const [linkReq] = await db
        .select()
        .from(parentLinkRequests)
        .where(eq(parentLinkRequests.id, id));

      if (!linkReq) {
        return res.status(404).json({ message: "Link request not found" });
      }

      if (linkReq.status !== 'pending') {
        return res.status(400).json({ message: "Request is no longer pending" });
      }

      if (new Date() > linkReq.expiresAt) {
        return res.status(400).json({ message: "Request has expired" });
      }

      // Verify coach is in the request's org (or is site admin)
      if (!isAdmin && linkReq.organizationId) {
        const coachOrgIds = await getCoachOrgIds(sessionUser.id);
        if (!coachOrgIds.includes(linkReq.organizationId)) {
          return res.status(403).json({ message: "You do not have access to this organization" });
        }
      }

      // Get parent email for the link record
      const parentRecord = await storage.getUser(linkReq.parentUserId);
      const parentEmail = parentRecord?.emails?.[0] ?? '';

      // Atomic: update request + create link in a transaction to prevent duplicates
      const now = new Date();
      await db.transaction(async (tx) => {
        // Re-check status under transaction to prevent concurrent approval
        const [locked] = await tx
          .select({ status: parentLinkRequests.status })
          .from(parentLinkRequests)
          .where(eq(parentLinkRequests.id, id));
        if (!locked || locked.status !== 'pending') {
          throw new Error('REQUEST_ALREADY_PROCESSED');
        }

        await tx
          .update(parentLinkRequests)
          .set({
            status: 'approved',
            processedBy: sessionUser.id,
            processedAt: now,
          })
          .where(eq(parentLinkRequests.id, id));

        await tx.insert(parentAthleteLinks).values({
          parentEmail,
          parentUserId: linkReq.parentUserId,
          athleteUserId: linkReq.athleteUserId,
          organizationId: linkReq.organizationId,
          isActive: true,
        }).onConflictDoNothing();
      });

      // Fire-and-forget: notify parent
      if (parentEmail) {
        (async () => {
          try {
            const childRecord = await storage.getUser(linkReq.athleteUserId);
            const childName = childRecord
              ? `${childRecord.firstName} ${childRecord.lastName}`.trim()
              : 'your child';
            await emailService.sendParentLinkRequestResult({
              to: parentEmail,
              childName,
              approved: true,
            });
          } catch (err) {
            console.error('[ParentLinkRequest] Failed to notify parent (approve):', err);
          }
        })();
      }

      return res.json({ success: true });
    } catch (error) {
      if (error instanceof Error && error.message === 'REQUEST_ALREADY_PROCESSED') {
        return res.status(400).json({ message: "Request is no longer pending" });
      }
      console.error('[ParentLinkRequest] approve error:', error);
      return res.status(500).json({ message: "Failed to approve link request" });
    }
  });

  // ==========================================================================
  // POST /api/coach/parent-link-requests/:id/deny
  // ==========================================================================
  app.post("/api/coach/parent-link-requests/:id/deny", requireAuth, async (req, res) => {
    try {
      const sessionUser = req.session.user;
      if (!sessionUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const isAdmin = isSiteAdmin(sessionUser);
      const hasAccess = await hasCoachAccess(sessionUser.id, isAdmin);
      if (!hasAccess) {
        return res.status(403).json({ message: "Insufficient permissions for this action" });
      }

      const { id } = req.params;
      const rawReason = (req.body as { reason?: string })?.reason;
      const reason = typeof rawReason === 'string' ? rawReason.trim().slice(0, 500) || undefined : undefined;

      const [linkReq] = await db
        .select()
        .from(parentLinkRequests)
        .where(eq(parentLinkRequests.id, id));

      if (!linkReq) {
        return res.status(404).json({ message: "Link request not found" });
      }

      if (linkReq.status !== 'pending') {
        return res.status(400).json({ message: "Request is no longer pending" });
      }

      if (new Date() > linkReq.expiresAt) {
        return res.status(400).json({ message: "Request has expired" });
      }

      // Verify coach is in the request's org (or is site admin)
      if (!isAdmin && linkReq.organizationId) {
        const coachOrgIds = await getCoachOrgIds(sessionUser.id);
        if (!coachOrgIds.includes(linkReq.organizationId)) {
          return res.status(403).json({ message: "You do not have access to this organization" });
        }
      }

      // Atomic deny with re-check to prevent double-deny race
      const now = new Date();
      await db.transaction(async (tx) => {
        const [locked] = await tx
          .select({ status: parentLinkRequests.status })
          .from(parentLinkRequests)
          .where(eq(parentLinkRequests.id, id));
        if (!locked || locked.status !== 'pending') {
          throw new Error('REQUEST_ALREADY_PROCESSED');
        }
        await tx
          .update(parentLinkRequests)
          .set({
            status: 'denied',
            processedBy: sessionUser.id,
            processedAt: now,
            denialReason: reason ?? null,
          })
          .where(eq(parentLinkRequests.id, id));
      });

      // Fire-and-forget: notify parent
      const parentRecord = await storage.getUser(linkReq.parentUserId);
      const parentEmail = parentRecord?.emails?.[0];
      if (parentEmail) {
        (async () => {
          try {
            const childRecord = await storage.getUser(linkReq.athleteUserId);
            const childName = childRecord
              ? `${childRecord.firstName} ${childRecord.lastName}`.trim()
              : 'your child';
            await emailService.sendParentLinkRequestResult({
              to: parentEmail,
              childName,
              approved: false,
              denialReason: reason,
            });
          } catch (err) {
            console.error('[ParentLinkRequest] Failed to notify parent (deny):', err);
          }
        })();
      }

      return res.json({ success: true });
    } catch (error) {
      if (error instanceof Error && error.message === 'REQUEST_ALREADY_PROCESSED') {
        return res.status(400).json({ message: "Request is no longer pending" });
      }
      console.error('[ParentLinkRequest] deny error:', error);
      return res.status(500).json({ message: "Failed to deny link request" });
    }
  });
}
