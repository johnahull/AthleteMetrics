/**
 * Invitation routes - handles all invitation-related endpoints
 * Extracted from routes.ts for better maintainability
 */

import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { ZodError } from "zod";
import { storage } from "../storage";
import { requireAuth } from "../middleware";
import { shouldSkipRateLimiting } from "../utils/rate-limit-utils";
import { generateInvitationLink } from "../utils/url-utils";
import { isSiteAdmin } from "@shared/auth-utils";
import { emailService } from "../services/email-service";
import type { Invitation } from "@shared/schema";
import { MAX_INVITATION_ATTEMPTS } from "../constants/invitations";
import {
  validateLegalAcceptanceTimestamp,
  getLegalAcceptanceTimestamp,
  INVALID_TIMESTAMP_MESSAGE,
  MISSING_ACCEPTANCE_MESSAGE,
  AUDIT_ACTION_LEGAL_ACCEPTED
} from "@shared/legal-acceptance";
import { db } from "../db";
import { parentAthleteLinks } from "@shared/schema/tables/coppa";
import { isUnder13, isMinorAge } from "@shared/coppa-utils";
import { coppaService } from "../services/coppa-service";
import crypto from "crypto";
import { hashToken } from "../lib/token-hash";

// Rate limiting for invitation endpoints
const invitationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20,
  message: { message: "Too many invitation requests, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => shouldSkipRateLimiting(req, 'general'),
});

const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 100,
  message: { message: "Too many create requests, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => shouldSkipRateLimiting(req, 'general'),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5,
  message: { message: "Too many authentication attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => shouldSkipRateLimiting(req, 'auth'),
});

// Helper function to send invitation email and track status
async function sendInvitationEmailWithTracking(
  invitation: Invitation,
  invitedById: string,
  req: Request
): Promise<boolean> {
  try {
    // Validate and clamp expiry days between 1 and 90 days
    const expiryDays = Math.max(1, Math.min(90, parseInt(process.env.INVITATION_EXPIRY_DAYS || '7', 10)));
    const inviter = await storage.getUser(invitedById);
    const organization = await storage.getOrganization(invitation.organizationId);

    const inviteLink = generateInvitationLink(req, invitation.token);

    const emailSent = await emailService.sendInvitation(invitation.email, {
      recipientName: invitation.firstName && invitation.lastName
        ? `${invitation.firstName} ${invitation.lastName}`
        : invitation.email,
      inviterName: inviter ? `${inviter.firstName} ${inviter.lastName}` : 'AthleteMetrics Team',
      organizationName: organization?.name || 'the organization',
      invitationLink: inviteLink,
      expiryDays,
      role: invitation.role === 'org_admin' ? 'Organization Admin' : invitation.role === 'coach' ? 'Coach' : 'Athlete'
    });

    // Update invitation with email sent status
    // Retry up to 3 times with exponential backoff if database update fails
    // Note: Email delivery is already complete at this point, so we use retry logic
    // rather than a transaction. If all retries fail, a warning is logged for manual verification.
    // This is acceptable since the invitation token remains valid and functional.
    if (emailSent) {
      let updateSuccess = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await storage.updateInvitation(invitation.id, {
            emailSent: true,
            emailSentAt: new Date()
          });
          updateSuccess = true;
          break;
        } catch (updateError) {
          console.error(`Failed to update email status for invitation ${invitation.id} (attempt ${attempt + 1}/3):`, updateError);
          if (attempt < 2) {
            await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)));
          }
        }
      }

      if (!updateSuccess) {
        console.warn(`WARNING: Email sent to ${invitation.email} but database status update failed after 3 attempts. Manual verification may be needed.`);
      }
    }

    return emailSent;
  } catch (error) {
    console.error(`Failed to send invitation email to ${invitation.email}:`, error);
    return false;
  }
}

// Unified invitation permission checker
async function checkInvitationPermissions(
  inviterId: string,
  invitationType: 'general',
  targetRole: string,
  organizationId?: string | null
): Promise<{ allowed: boolean; reason?: string }> {
  if (!inviterId) {
    return { allowed: false, reason: "No inviter ID provided" };
  }

  const inviter = await storage.getUser(inviterId);
  if (!inviter) {
    return { allowed: false, reason: "Inviter not found" };
  }

  // Site admins can invite anyone to any role anywhere
  if (isSiteAdmin(inviter)) {
    return { allowed: true };
  }

  // For non-site admins, organization context is required
  if (!organizationId) {
    return { allowed: false, reason: "Organization context required for non-site admin invitations" };
  }

  // Check inviter's roles in the organization
  const inviterRoles = await storage.getUserRoles(inviterId, organizationId);

  // Organization admins can invite anyone within their organization
  if (inviterRoles.includes("org_admin")) {
    return { allowed: true };
  }

  // Coaches can invite athletes and parents
  if (inviterRoles.includes("coach")) {
    if (targetRole === "athlete" || targetRole === "parent") {
      return { allowed: true };
    }
    return { allowed: false, reason: "Coaches can only invite athletes and parents" };
  }

  return { allowed: false, reason: "Insufficient permissions to invite users" };
}

export function registerInvitationRoutes(app: Express) {
  /**
   * Create invitation - unified endpoint for all invitation types
   */
  app.post("/api/invitations", createLimiter, requireAuth, async (req, res) => {
    try {
      const { email, firstName, lastName, role, organizationId, teamIds, athleteId, birthDate, parentEmail } = req.body;

      // Get current user info for invitedBy
      const invitedById = req.session.user?.id;

      if (!invitedById) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // ── COPPA invite-create validation (coppa-compliance-spec, "Invitation
      // flow modification") ─────────────────────────────────────────────────
      // birthDate is optional (the coach may not know it; the accept-time age
      // gate is the backstop), but an under-13 athlete invitation cannot be
      // created without a parentEmail — the VPC email must be able to fire at
      // accept even if the athlete's form omits it.
      if (birthDate !== undefined && birthDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(birthDate))) {
        return res.status(400).json({ message: "birthDate must be in YYYY-MM-DD format" });
      }
      const normalizedInviteParentEmail: string | undefined =
        typeof parentEmail === 'string' && parentEmail.trim() !== ''
          ? parentEmail.trim().toLowerCase()
          : undefined;
      if (normalizedInviteParentEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedInviteParentEmail)) {
        return res.status(400).json({ message: "parentEmail must be a valid email address" });
      }

      /** Under-13/parent-email rules for one effective birthDate + invitee email. */
      const validateInviteCoppa = (effectiveBirthDate: string | undefined | null, inviteeEmail: string, effectiveParentEmail: string | undefined): string | null => {
        if (!effectiveBirthDate) return null;
        let under13: boolean;
        try {
          under13 = isUnder13(effectiveBirthDate);
        } catch {
          return "Invalid birthDate.";
        }
        if (!under13) return null;
        if (role !== 'athlete') {
          return "This invitation role requires an adult. Remove the under-13 birth date or invite as an athlete.";
        }
        if (!effectiveParentEmail) {
          return "A parent or guardian email is required to invite an athlete under 13 (COPPA).";
        }
        if (effectiveParentEmail === inviteeEmail.toLowerCase()) {
          return "Parent email must be different from the athlete's email.";
        }
        return null;
      };

      // Handle athlete invitation (send to all their emails)
      if (athleteId && role === "athlete") {
        const athlete = await storage.getAthlete(athleteId);
        if (!athlete) {
          return res.status(404).json({ message: "Athlete not found" });
        }

        // Validate organization exists
        const org = await storage.getOrganization(organizationId);
        if (!org) {
          return res.status(400).json({ message: "Invalid organization ID" });
        }

        // Check permissions using unified function
        const permissionCheck = await checkInvitationPermissions(invitedById, 'general', role, organizationId);
        if (!permissionCheck.allowed) {
          return res.status(403).json({ message: permissionCheck.reason || "Insufficient permissions to invite users" });
        }

        // Validate team IDs if provided
        if (teamIds && Array.isArray(teamIds) && teamIds.length > 0) {
          for (const teamId of teamIds) {
            const team = await storage.getTeam(teamId);
            if (!team) {
              return res.status(400).json({ message: `Team with ID ${teamId} not found` });
            }
            if (team.organizationId !== organizationId) {
              return res.status(400).json({ message: `Team ${teamId} does not belong to organization ${organizationId}` });
            }
          }
        }

        // Send invitations to all athlete's email addresses
        const invitations = [];
        const athleteEmails = athlete.emails || [];

        if (athleteEmails.length === 0) {
          return res.status(400).json({ message: "Athlete has no email addresses on file" });
        }

        // COPPA: the linked athlete record is the server-known source of age
        // truth; a request-provided parentEmail overrides the record's.
        const recordBirthDate = athlete.birthDate ? String(athlete.birthDate) : (birthDate ?? undefined);
        const recordParentEmail = normalizedInviteParentEmail
          ?? (athlete.parentEmail ? String(athlete.parentEmail).toLowerCase() : undefined);
        const athleteCoppaError = validateInviteCoppa(recordBirthDate, athleteEmails[0] ?? '', recordParentEmail);
        if (athleteCoppaError) {
          return res.status(400).json({ message: athleteCoppaError });
        }

        // Fetch invitations for this organization to avoid N+1 query
        const existingInvitations = await storage.getInvitationsByOrganization(organizationId);

        for (const athleteEmail of athleteEmails) {
          try {
            // Check for existing pending invitations to prevent duplicates
            const existingInvitation = existingInvitations.find(inv =>
              inv.email === athleteEmail &&
              inv.organizationId === organizationId &&
              !inv.isUsed &&
              inv.status !== 'cancelled' &&
              inv.status !== 'expired' &&
              new Date(inv.expiresAt) > new Date()
            );

            if (existingInvitation) {
              // Skip this email, it already has a pending invitation
              continue;
            }

            const invitation = await storage.createInvitation({
              email: athleteEmail,
              firstName: athlete.firstName,
              lastName: athlete.lastName,
              organizationId,
              teamIds: teamIds || [],
              role,
              invitedBy: invitedById,
              playerId: athlete.id,
              birthDate: recordBirthDate,
              parentEmail: recordParentEmail,
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Expires in 7 days
            });
            invitations.push(invitation);
          } catch (error) {
            console.warn('Failed to create athlete invitation:', error);
            throw error; // Re-throw to catch in outer handler
          }
        }

        if (invitations.length === 0) {
          return res.status(400).json({ message: "All email addresses already have pending invitations" });
        }

        // Generate invite links and send emails
        const inviteLinks = [];
        const emailResults = [];

        for (const inv of invitations) {
          const inviteLink = generateInvitationLink(req, inv.token);
          inviteLinks.push(inviteLink);

          // Send invitation email using shared helper
          const emailSent = await sendInvitationEmailWithTracking(inv, invitedById, req);
          emailResults.push({ email: inv.email, sent: emailSent });
        }

        return res.status(201).json({
          invitations: invitations.map(inv => ({ id: inv.id, email: inv.email })),
          inviteLinks,
          emailResults,
          athlete: {
            id: athlete.id,
            firstName: athlete.firstName,
            lastName: athlete.lastName
          },
          message: `${invitations.length} invitations created for ${athlete.firstName} ${athlete.lastName}`
        });
      }

      // Handle regular invitation (single email)
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      if (!role) {
        return res.status(400).json({ message: "Role is required" });
      }

      if (!organizationId) {
        return res.status(400).json({ message: "Organization is required" });
      }

      // Parent invitations require an athleteId to establish the link
      if (role === 'parent' && !athleteId) {
        return res.status(400).json({ message: "athleteId is required when inviting a parent" });
      }

      // Validate organizationId is a valid string format
      if (typeof organizationId !== 'string' || organizationId.trim().length === 0) {
        return res.status(400).json({ message: "Organization ID must be a valid string" });
      }

      // Validate organization exists
      const org = await storage.getOrganization(organizationId);
      if (!org) {
        return res.status(400).json({ message: "Invalid organization ID" });
      }

      // For parent invitations, validate the athlete exists and belongs to the org
      if (role === 'parent' && athleteId) {
        const athlete = await storage.getAthlete(athleteId);
        if (!athlete) {
          return res.status(404).json({ message: "Athlete not found" });
        }
        // Verify athlete is in this organization
        const userOrgs = await storage.getUserOrganizations(athleteId);
        const inOrg = userOrgs.some(o => o.organizationId === organizationId);
        if (!inOrg) {
          return res.status(400).json({ message: "Athlete does not belong to this organization" });
        }
      }

      // Check permissions using unified function
      const permissionCheck = await checkInvitationPermissions(invitedById, 'general', role, organizationId);
      if (!permissionCheck.allowed) {
        return res.status(403).json({ message: permissionCheck.reason || "Insufficient permissions to invite users" });
      }

      // Validate team IDs if provided
      if (teamIds && Array.isArray(teamIds) && teamIds.length > 0) {
        for (const teamId of teamIds) {
          const team = await storage.getTeam(teamId);
          if (!team) {
            return res.status(400).json({ message: `Team with ID ${teamId} not found` });
          }
          if (team.organizationId !== organizationId) {
            return res.status(400).json({ message: `Team ${teamId} does not belong to organization ${organizationId}` });
          }
        }
      }

      // COPPA: an under-13 athlete invitation requires a parent email
      const coppaError = validateInviteCoppa(birthDate ?? undefined, String(email), normalizedInviteParentEmail);
      if (coppaError) {
        return res.status(400).json({ message: coppaError });
      }

      // Validate and clamp expiry days between 1 and 90 days
      const expiryDays = Math.max(1, Math.min(90, parseInt(process.env.INVITATION_EXPIRY_DAYS || '7', 10)));
      const invitation = await storage.createInvitation({
        email,
        firstName: firstName || null,
        lastName: lastName || null,
        organizationId,
        teamIds: teamIds || [],
        role,
        invitedBy: invitedById,
        // For parent invitations, store athleteId in playerId field to preserve the link
        playerId: (role === 'parent' && athleteId) ? athleteId : undefined,
        birthDate: birthDate ?? undefined,
        parentEmail: normalizedInviteParentEmail,
        expiresAt: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000)
      });

      // Generate invite link
      const inviteLink = generateInvitationLink(req, invitation.token);

      // For parent invitations, send the dedicated parent email template
      let emailSent: boolean;
      if (role === 'parent' && athleteId) {
        const athlete = await storage.getAthlete(athleteId);
        emailSent = await emailService.sendParentInvitation(email, {
          parentName: firstName ? `${firstName} ${lastName || ''}`.trim() : undefined,
          athleteName: athlete ? `${athlete.firstName} ${athlete.lastName}` : 'your athlete',
          organizationName: org.name,
          invitationLink: inviteLink,
          expiryDays,
        });
        // Update invitation email sent status
        if (emailSent) {
          await storage.updateInvitation(invitation.id, { emailSent: true, emailSentAt: new Date() });
        }
      } else {
        emailSent = await sendInvitationEmailWithTracking(invitation, invitedById, req);
      }

      // Audit log
      await storage.createAuditLog({
        userId: invitedById,
        action: 'invitation_created',
        resourceType: 'invitation',
        resourceId: invitation.id,
        details: JSON.stringify({
          email: invitation.email,
          role: invitation.role,
          organizationId: invitation.organizationId,
          athleteId: role === 'parent' ? athleteId : undefined,
          emailSent
        }),
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      return res.status(201).json({
        id: invitation.id,
        email: invitation.email,
        inviteLink,
        emailSent,
        message: `Invitation created for ${firstName || ''} ${lastName || ''} (${email})`.trim()
      });
    } catch (error) {
      console.error("Error creating invitation:", error);
      // Don't expose internal error details to client
      res.status(500).json({ message: "Failed to create invitation" });
    }
  });

  /**
   * Resend invitation email
   */
  app.post("/api/invitations/:invitationId/resend", invitationLimiter, requireAuth, async (req, res) => {
    try {
      const { invitationId } = req.params;
      const userId = req.session.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Get the invitation
      const invitation = await storage.getInvitationById(invitationId);

      if (!invitation) {
        return res.status(404).json({ message: "Invitation not found" });
      }

      // Check if user has permission (must be in the same organization with appropriate role)
      const userOrgs = await storage.getUserOrganizations(userId);
      const currentUser = req.session.user;
      const userIsSiteAdmin = isSiteAdmin(currentUser);

      // Find user's role in the invitation's organization
      const userOrgRole = userOrgs.find(org => org.organizationId === invitation.organizationId);

      if (!userOrgRole && !userIsSiteAdmin) {
        return res.status(403).json({ message: "Insufficient permissions - you are not a member of this organization" });
      }

      // Check role-based permissions
      const isOrgAdmin = userOrgRole?.role === "org_admin";
      const isCoach = userOrgRole?.role === "coach";

      // Site admins can resend any invitation
      // Org admins can resend any invitation in their org
      // Coaches can only resend athlete invitations
      if (!userIsSiteAdmin && !isOrgAdmin) {
        if (!isCoach || invitation.role !== 'athlete') {
          return res.status(403).json({ message: "Insufficient permissions to resend this invitation" });
        }
      }

      // Check if invitation is still pending
      if (invitation.isUsed) {
        return res.status(400).json({ message: "Invitation has already been accepted" });
      }

      if (invitation.status === 'cancelled') {
        return res.status(400).json({ message: "Invitation has been cancelled" });
      }

      // Rotate the token on resend: the stored token is only a hash and cannot
      // be reversed to build a working link, so issue a fresh token, store its
      // hash, and email the raw value. (This invalidates any earlier link.)
      const newRawToken = crypto.randomUUID();

      // Extend expiration regardless of current state (atomic update)
      // Validate and clamp expiry days between 1 and 90 days
      const expiryDays = Math.max(1, Math.min(90, parseInt(process.env.INVITATION_EXPIRY_DAYS || '7', 10)));
      const newExpiration = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
      await storage.updateInvitation(invitationId, {
        token: hashToken(newRawToken),
        expiresAt: newExpiration,
        status: 'pending'
      });

      // Send invitation email using shared helper, with the raw token for the link.
      const emailSent = await sendInvitationEmailWithTracking(
        { ...invitation, token: newRawToken },
        userId,
        req,
      );

      // Audit log
      await storage.createAuditLog({
        userId,
        action: 'invitation_resent',
        resourceType: 'invitation',
        resourceId: invitationId,
        details: JSON.stringify({
          email: invitation.email,
          emailSent
        }),
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      res.json({
        success: true,
        emailSent,
        message: emailSent
          ? "Invitation email resent successfully"
          : "Invitation updated but email sending failed"
      });
    } catch (error) {
      console.error("Error resending invitation:", error);
      res.status(500).json({ message: "Failed to resend invitation" });
    }
  });

  /**
   * Cancel invitation
   */
  app.post("/api/invitations/:invitationId/cancel", invitationLimiter, requireAuth, async (req, res) => {
    try {
      const { invitationId } = req.params;
      const userId = req.session.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Get the invitation
      const invitation = await storage.getInvitationById(invitationId);

      if (!invitation) {
        return res.status(404).json({ message: "Invitation not found" });
      }

      // Check if user has permission (must be in the same organization with appropriate role)
      const userOrgs = await storage.getUserOrganizations(userId);
      const currentUser = req.session.user;
      const userIsSiteAdmin = isSiteAdmin(currentUser);

      // Find user's role in the invitation's organization
      const userOrgRole = userOrgs.find(org => org.organizationId === invitation.organizationId);

      if (!userOrgRole && !userIsSiteAdmin) {
        return res.status(403).json({ message: "Insufficient permissions - you are not a member of this organization" });
      }

      // Check role-based permissions
      const isOrgAdmin = userOrgRole?.role === "org_admin";
      const isCoach = userOrgRole?.role === "coach";

      // Site admins can cancel any invitation
      // Org admins can cancel any invitation in their org
      // Coaches can only cancel athlete invitations
      if (!userIsSiteAdmin && !isOrgAdmin) {
        if (!isCoach || invitation.role !== 'athlete') {
          return res.status(403).json({ message: "Insufficient permissions to cancel this invitation" });
        }
      }

      // Check if invitation is already used or cancelled
      if (invitation.isUsed) {
        return res.status(400).json({ message: "Cannot cancel an accepted invitation" });
      }

      if (invitation.status === 'cancelled') {
        return res.status(400).json({ message: "Invitation is already cancelled" });
      }

      // Cancel the invitation
      await storage.updateInvitation(invitationId, {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: userId
      });

      // Audit log
      await storage.createAuditLog({
        userId,
        action: 'invitation_cancelled',
        resourceType: 'invitation',
        resourceId: invitationId,
        details: JSON.stringify({
          email: invitation.email,
          role: invitation.role
        }),
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      res.json({
        success: true,
        message: "Invitation cancelled successfully"
      });
    } catch (error) {
      console.error("Error cancelling invitation:", error);
      res.status(500).json({ message: "Failed to cancel invitation" });
    }
  });

  /**
   * Get all invitations for user's organizations
   */
  app.get("/api/invitations", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user?.id;
      const currentUser = req.session.user;

      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Get user's organizations
      const userOrgs = await storage.getUserOrganizations(userId);

      if (userOrgs.length === 0) {
        return res.json([]);
      }

      // Check role-based authorization
      const userIsSiteAdmin = isSiteAdmin(currentUser);
      const isOrgAdmin = userOrgs.some(org => org.role === "org_admin");
      const isCoach = userOrgs.some(org => org.role === "coach");

      // Only Site Admins, Org Admins, and Coaches can view invitations
      if (!userIsSiteAdmin && !isOrgAdmin && !isCoach) {
        return res.status(403).json({ message: "Insufficient permissions to view invitations" });
      }

      // Get all invitations for these organizations
      const allInvitations = await storage.getInvitations();
      const userInvitations = allInvitations.filter(invitation =>
        userOrgs.some(userOrg => userOrg.organizationId === invitation.organizationId)
      );

      // Filter invitations based on role
      const filteredInvitations = userInvitations.filter(invitation => {
        // Site admins and org admins see all invitations
        if (userIsSiteAdmin || isOrgAdmin) {
          return true;
        }
        // Coaches only see athlete invitations
        if (isCoach) {
          return invitation.role === 'athlete';
        }
        return false;
      });

      // Batch fetch users and organizations to avoid N+1 queries
      const inviterIds = [...new Set(filteredInvitations.map(i => i.invitedBy).filter(Boolean))] as string[];
      const orgIds = [...new Set(filteredInvitations.map(i => i.organizationId))];

      const [usersMap, orgsMap] = await Promise.all([
        storage.getUsersBatch(inviterIds),
        storage.getOrganizationsBatch(orgIds)
      ]);

      // Enrich with additional data
      const enrichedInvitations = filteredInvitations.map((invitation) => {
        const inviter = invitation.invitedBy ? usersMap.get(invitation.invitedBy) : null;
        const organization = orgsMap.get(invitation.organizationId);

        return {
          ...invitation,
          inviterName: inviter ? `${inviter.firstName} ${inviter.lastName}` : 'Unknown',
          organizationName: organization?.name || 'Unknown'
        };
      });

      // Sort by creation date (newest first)
      enrichedInvitations.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      res.json(enrichedInvitations);
    } catch (error) {
      console.error("Error fetching invitations:", error);
      res.status(500).json({ message: "Failed to fetch invitations" });
    }
  });

  /**
   * Get athlete invitations for user's organizations
   */
  app.get("/api/invitations/athletes", requireAuth, async (req, res) => {
    try {
      const user = req.session.user;

      if (!user || !user.id) {
        return res.json([]);
      }

      const userOrgs = await storage.getUserOrganizations(user.id);

      if (userOrgs.length === 0) {
        return res.json([]);
      }

      const allInvitations = await storage.getInvitations();

      const athleteInvitations = allInvitations.filter(invitation =>
        invitation.role === 'athlete' &&
        !invitation.isUsed &&
        userOrgs.some(userOrg => userOrg.organizationId === invitation.organizationId)
      );

      // Enrich with athlete data - handle errors gracefully
      const enrichedInvitations = await Promise.all(
        athleteInvitations.map(async (invitation) => {
          try {
            if (invitation.playerId) {
              const athlete = await storage.getAthlete(invitation.playerId);
              return {
                ...invitation,
                firstName: invitation.firstName || athlete?.firstName,
                lastName: invitation.lastName || athlete?.lastName
              };
            }
            return invitation;
          } catch (athleteError) {
            console.error(`Error fetching athlete for invitation ${invitation.id}:`, athleteError);
            return invitation;
          }
        })
      );

      res.json(enrichedInvitations);
    } catch (error) {
      console.error("Error fetching athlete invitations:", error);
      res.status(500).json({ message: "Failed to fetch athlete invitations", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * Get invitation by token (public endpoint for invitation acceptance page)
   */
  app.get("/api/invitations/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const invitation = await storage.getInvitation(token);

      if (!invitation) {
        return res.status(404).json({ message: "Invitation not found" });
      }

      if (invitation.isUsed === true) {
        return res.status(400).json({ message: "Invitation already used" });
      }

      if (new Date() > invitation.expiresAt) {
        return res.status(400).json({ message: "Invitation expired" });
      }

      const responseData = {
        email: invitation.email,
        firstName: invitation.firstName,
        lastName: invitation.lastName,
        role: invitation.role,
        organizationId: invitation.organizationId,
        teamIds: invitation.teamIds,
        playerId: invitation.playerId, // Include player/user ID if this is for an existing athlete
        // COPPA prefill for the accept form. Exposed to any token bearer —
        // the same trust level as the invitee email already returned above.
        birthDate: invitation.birthDate,
        parentEmail: invitation.parentEmail
      };

      res.json(responseData);
    } catch (error) {
      console.error("Error fetching invitation:", error);
      res.status(500).json({ message: "Failed to fetch invitation" });
    }
  });

  /**
   * Delete invitation
   */
  app.delete("/api/invitations/:id", requireAuth, async (req, res) => {
    try {
      const { id: invitationId } = req.params;
      const userId = req.session.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const invitation = await storage.getInvitationById(invitationId);

      if (!invitation) {
        return res.status(404).json({ message: "Invitation not found" });
      }

      const currentUser = req.session.user;
      const userIsSiteAdmin = isSiteAdmin(currentUser);

      // Check if user has permission (Site Admin, Org Admin, or Coach)
      const userOrgs = await storage.getUserOrganizations(userId);
      const userOrgRole = userOrgs.find(org => org.organizationId === invitation.organizationId);
      const isOrgAdmin = userOrgRole?.role === "org_admin";
      const isCoach = userOrgRole?.role === "coach";

      // Allow Site Admins, Org Admins, and Coaches to delete invitations
      if (!userIsSiteAdmin && !isOrgAdmin && !isCoach) {
        return res.status(403).json({ message: "Insufficient permissions - only site admins, organization admins, and coaches can delete invitations" });
      }

      // Delete the invitation only - do not remove user from organization
      await storage.deleteInvitation(invitationId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting invitation:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to delete invitation";
      res.status(500).json({
        error: "Failed to delete invitation",
        message: errorMessage,
        details: error instanceof Error ? error.stack : String(error)
      });
    }
  });

  /**
   * Accept invitation and create user account
   */
  app.post("/api/invitations/:token/accept", authLimiter, async (req, res) => {
    try {
      const { token } = req.params;
      const { password, firstName, lastName, username, legalAcceptedAt, birthDate, parentEmail } = req.body;

      // Validate legal acceptance is provided and valid
      if (!legalAcceptedAt) {
        return res.status(400).json({ message: MISSING_ACCEPTANCE_MESSAGE });
      }

      // COPPA format checks (role/age-dependent rules run after the invitation
      // is fetched, since requiredness depends on invitation.role).
      // Note: the frontend requires birthDate for every role; the server only
      // requires it for athletes — intentional belt-and-suspenders.
      if (birthDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(birthDate))) {
        return res.status(400).json({ message: "birthDate must be in YYYY-MM-DD format" });
      }
      const normalizedParentEmail: string | undefined = typeof parentEmail === 'string' && parentEmail.trim() !== ''
        ? parentEmail.trim().toLowerCase()
        : undefined;
      if (normalizedParentEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedParentEmail)) {
        return res.status(400).json({ message: "parentEmail must be a valid email address" });
      }

      if (!validateLegalAcceptanceTimestamp(legalAcceptedAt)) {
        return res.status(400).json({ message: INVALID_TIMESTAMP_MESSAGE });
      }

      // CSRF-like protection: Verify request came from same origin
      const referer = req.headers.referer || req.headers.origin;
      const host = req.headers.host;
      if (referer && host) {
        const refererHost = new URL(referer).host;
        if (refererHost !== host) {
          console.warn(`Invitation acceptance blocked: Referer mismatch. Expected: ${host}, Got: ${refererHost}`);
          return res.status(403).json({ message: "Invalid request origin" });
        }
      }

      // Validate username using shared validation
      const { validateUsername } = await import('@shared/username-validation');
      const usernameValidation = validateUsername(username);
      if (!usernameValidation.valid) {
        return res.status(400).json({ message: usernameValidation.errors[0] });
      }

      // Validate password using shared validation
      const { validatePassword } = await import('@shared/password-requirements');
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.valid) {
        return res.status(400).json({ message: passwordValidation.errors[0] });
      }

      // Check if username already exists
      const existingUser = await storage.getUserByUsername(username);

      // Add constant-time delay to prevent timing-based username enumeration
      await new Promise(resolve => setTimeout(resolve, 100));

      if (existingUser) {
        return res.status(400).json({ message: "Username unavailable. Please choose a different username." });
      }

      // Get invitation (without the isUsed check to track failed attempts)
      const invitation = await storage.getInvitationByToken(token);

      if (!invitation) {
        console.error("Invitation not found for token:", token);
        return res.status(404).json({ message: "Invitation not found" });
      }

      // Check if invitation is already used
      if (invitation.isUsed || invitation.status === 'accepted') {
        await storage.updateInvitation(invitation.id, {
          lastAttemptAt: new Date(),
          attemptCount: (invitation.attemptCount || 0) + 1
        });
        return res.status(400).json({ message: "This invitation has already been used" });
      }

      // Check if invitation is cancelled
      if (invitation.status === 'cancelled') {
        await storage.updateInvitation(invitation.id, {
          lastAttemptAt: new Date(),
          attemptCount: (invitation.attemptCount || 0) + 1
        });
        return res.status(400).json({ message: "This invitation has been cancelled" });
      }

      // Check if invitation is expired
      if (new Date(invitation.expiresAt) < new Date()) {
        await storage.updateInvitation(invitation.id, {
          lastAttemptAt: new Date(),
          attemptCount: (invitation.attemptCount || 0) + 1,
          status: 'expired'
        });
        return res.status(400).json({ message: "This invitation has expired" });
      }

      // Check attempt count (prevent brute force)
      if ((invitation.attemptCount || 0) >= MAX_INVITATION_ATTEMPTS) {
        await storage.updateInvitation(invitation.id, {
          status: 'cancelled',
          cancelledAt: new Date()
        });
        return res.status(429).json({ message: "Too many failed attempts. This invitation has been locked." });
      }

      // ── COPPA age classification (P0-11) ────────────────────────────────
      // Effective birthDate precedence: linked player record (server-known,
      // coach-entered) wins over the form value — a form entry cannot
      // reclassify someone the server already knows the age of.
      // All validation failures below early-return 400 BEFORE acceptInvitation:
      // the catch block increments attemptCount and locks the invitation.
      let effectiveBirthDate: string | undefined =
        typeof birthDate === 'string' && birthDate !== '' ? birthDate : undefined;
      if (invitation.playerId) {
        const linkedPlayer = await storage.getUser(invitation.playerId);
        if (linkedPlayer?.birthDate) {
          effectiveBirthDate = String(linkedPlayer.birthDate);
        }
      }

      if (invitation.role === 'athlete' && !effectiveBirthDate) {
        return res.status(400).json({ message: "Date of birth is required to accept an athlete invitation." });
      }

      let under13 = false;
      let minor = false;
      if (effectiveBirthDate) {
        try {
          under13 = isUnder13(effectiveBirthDate);
          minor = isMinorAge(effectiveBirthDate);
        } catch {
          return res.status(400).json({ message: "Invalid date of birth." });
        }
      }
      const teenMinor = minor && !under13;

      if (under13 && invitation.role !== 'athlete') {
        return res.status(400).json({ message: "This invitation role requires an adult. Please contact your organization." });
      }
      if (under13 && !normalizedParentEmail) {
        return res.status(400).json({ message: "A parent or guardian email is required for athletes under 13." });
      }
      if (normalizedParentEmail && normalizedParentEmail === invitation.email.toLowerCase()) {
        return res.status(400).json({ message: "Parent email must be different from the athlete's email." });
      }

      const result = await storage.acceptInvitation(
        token,
        {
          email: invitation.email,
          username,
          password,
          firstName,
          lastName,
          legalAcceptedAt,
          legalAcceptedVersion: getLegalAcceptanceTimestamp(), // Format: "2024-12-13"
          ...(effectiveBirthDate ? {
            coppa: {
              birthDate: effectiveBirthDate,
              isMinor: minor,
              under13,
              parentEmail: minor ? normalizedParentEmail : undefined,
            }
          } : {}),
        },
        {
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        }
      );

      console.log("Invitation accepted successfully, user created:", result.user.id);

      // Note: Audit logs (legal acceptance + invitation accepted) are created inside
      // the acceptInvitation transaction for atomicity. No need to create them here.

      // For parent invitations: create parentAthleteLinks row linking parent to athlete
      if (invitation.role === 'parent' && invitation.playerId) {
        try {
          await db.insert(parentAthleteLinks).values({
            parentEmail: invitation.email,
            parentUserId: result.user.id,
            athleteUserId: invitation.playerId,
            organizationId: invitation.organizationId,
          }).onConflictDoNothing();

          console.log(`[InvitationAcceptance] Parent link created: ${result.user.id} -> athlete ${invitation.playerId}`);
        } catch (linkError) {
          console.error('[InvitationAcceptance] Failed to create parent athlete link:', linkError);
          // Non-fatal: user account and org membership already created
        }
      }

      // ── COPPA session gate ──────────────────────────────────────────────
      // Gate on the FINAL user row, not just the form-derived classification:
      // an existing account joining a new org may already be pending_consent
      // or consent_revoked, and must not receive a session here that the
      // login route would refuse.
      if (result.user.coppaStatus === 'consent_revoked') {
        return res.status(403).json({
          message: "Parental consent for this account was revoked. Please contact your organization or support to re-initiate consent."
        });
      }

      if (result.user.coppaStatus === 'pending_consent') {
        // Under-13: initiate VPC AFTER the accept transaction committed
        // (initiateConsent runs its own transaction and sends the parent
        // email). No session, no welcome email — confirmConsent notifies
        // the athlete when the parent approves.
        const consentParentEmail = normalizedParentEmail || result.user.parentEmail;
        let consentEmailSent: boolean | undefined;
        if (consentParentEmail) {
          const coppaResult = await coppaService.initiateConsent({
            athleteUserId: result.user.id,
            parentEmail: consentParentEmail,
            organizationId: invitation.organizationId,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
          });
          consentEmailSent = coppaResult.emailSent;
          console.log(`[InvitationAcceptance] Minor accepted invite: ${result.user.id}, VPC initiated: ${coppaResult.success}, emailSent: ${coppaResult.emailSent}`);
        }

        const consentMessage = consentEmailSent === false
          ? "Your account has been created. We were unable to send the consent email to your parent. Please ask them to visit the consent page directly, or try again later."
          : "Your account has been created. A consent email has been sent to your parent or guardian. You'll be able to log in once they approve your account.";

        return res.json({
          success: true,
          requiresParentalConsent: true,
          message: consentMessage,
        });
      }

      // Teen minor (13-17) with a parent email: record the link and notify
      // the parent (informational, not a consent request), then continue to
      // the normal session flow. Conflict-safe: Path A/B users may already
      // have a link row for this parent.
      if (teenMinor && normalizedParentEmail) {
        try {
          await db.insert(parentAthleteLinks).values({
            parentEmail: normalizedParentEmail,
            athleteUserId: result.user.id,
            organizationId: invitation.organizationId,
            isActive: true,
          }).onConflictDoNothing();
        } catch (linkError) {
          console.error('[InvitationAcceptance] Failed to create teen parent link:', linkError);
          // Non-fatal: account creation already succeeded
        }
        emailService.sendParentNotification({
          parentEmail: normalizedParentEmail,
          athleteFirstName: result.user.firstName,
        }).catch((err: unknown) => {
          console.error('[InvitationAcceptance] Failed to send parent notification email:', err);
        });
      }

      // Send welcome email
      const organization = await storage.getOrganization(result.invitation.organizationId);
      const roleDisplayName = invitation.role === 'org_admin' ? 'Organization Admin'
        : invitation.role === 'coach' ? 'Coach'
        : invitation.role === 'parent' ? 'Parent/Guardian'
        : 'Athlete';
      await emailService.sendWelcome(result.user.emails[0], {
        userName: `${result.user.firstName} ${result.user.lastName}`,
        organizationName: organization?.name || 'the organization',
        role: roleDisplayName
      });

      // Use the role from the invitation
      let userRole = invitation.role;
      if (result.user.isSiteAdmin === true) {
        userRole = "site_admin";
      }

      // Log the new user in - regenerate session to prevent session fixation
      req.session.regenerate((err) => {
        if (err) {
          console.error('Session regeneration error during invitation acceptance:', err);
          return res.status(500).json({ message: "Account creation successful but login failed" });
        }

        req.session.user = {
          id: result.user.id,
          username: result.user.username,
          email: result.user.emails?.[0] || `${result.user.username}@temp.local`,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          role: userRole,
          isSiteAdmin: result.user.isSiteAdmin === true
        };

        req.session.save((saveErr) => {
          if (saveErr) {
            console.error('Session save error during invitation acceptance:', saveErr);
            return res.status(500).json({ message: "Account creation successful but login failed" });
          }

          // Determine redirect URL based on user role
          let redirectUrl = "/";
          if (userRole === "athlete") {
            redirectUrl = `/athletes/${result.user.id}`;
          } else if (userRole === "parent") {
            redirectUrl = "/parent/children";
          }

          res.json({
            success: true,
            user: req.session.user,
            message: "Account created successfully!",
            redirectUrl
          });
        });
      });
    } catch (error) {
      console.error("Error accepting invitation:", error);

      // Track failed attempt if we have the invitation
      const { token } = req.params;
      if (token) {
        try {
          const invitation = await storage.getInvitationByToken(token);
          if (invitation && !invitation.isUsed) {
            await storage.updateInvitation(invitation.id, {
              lastAttemptAt: new Date(),
              attemptCount: (invitation.attemptCount || 0) + 1
            });
          }
        } catch (trackError) {
          console.error("Error tracking failed attempt:", trackError);
        }
      }

      // Handle Zod validation errors with user-friendly messages
      if (error instanceof ZodError) {
        const firstError = error.errors[0];
        const field = firstError.path.join('.');
        const message = firstError.message;

        return res.status(400).json({
          message: `${field ? field + ': ' : ''}${message}`
        });
      }

      // Handle other known errors
      const errorMessage = error instanceof Error ? error.message : "Failed to accept invitation";
      const statusCode = errorMessage.includes("not found") || errorMessage.includes("Invalid") ? 404 : 500;

      res.status(statusCode).json({ message: errorMessage });
    }
  });

  console.log("✅ Invitation routes registered");
}
