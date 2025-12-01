/**
 * Service for managing cross-organization athlete identity linking
 */

import { db } from "../db";
import {
  globalAthletes, userGlobalAthleteLinks, globalAthleteAuditLog,
  users, measurements, userOrganizations, organizations,
  globalAthleteClaims,
  type GlobalAthlete, type UserGlobalAthleteLink, type GlobalAthleteClaim
} from "@shared/schema";
import crypto from "crypto";
import { eq, and, inArray, desc, ne, isNull, isNotNull, count, sql, ilike, or } from "drizzle-orm";
import { BaseService } from "./base-service";
import { emailService } from "./email-service";

export interface PrivacySettings {
  allowCrossOrgLinking?: boolean;
}

export interface LinkedUserOptions {
  shareMeasurementsOnly?: boolean;
  confirmedOnly?: boolean;
}

export class GlobalAthleteService extends BaseService {
  /**
   * Called when a user verifies their email address.
   * Creates or links to existing global athlete identity.
   */
  async onEmailVerified(userId: string, verifiedEmail: string): Promise<void> {
    // Check if user already has a global athlete link
    const existingLink = await this.getUserGlobalAthleteLink(userId);
    if (existingLink) {
      // User already linked - skip
      return;
    }

    // Get user details for canonical profile
    const user = await this.storage.getUser(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Check if a global athlete exists with this verified email
    const existingGlobalAthlete = await this.findByVerifiedEmail(verifiedEmail);

    if (existingGlobalAthlete && existingGlobalAthlete.allowCrossOrgLinking) {
      // Auto-link to existing global athlete - user is joining an existing identity
      await this.createAutoLink(userId, existingGlobalAthlete.id, verifiedEmail, user, existingGlobalAthlete);
    } else if (!existingGlobalAthlete) {
      // Create new global athlete
      const [newGlobalAthlete] = await db.insert(globalAthletes).values({
        verifiedEmails: [verifiedEmail],
        primaryEmail: verifiedEmail,
        canonicalFirstName: user.firstName,
        canonicalLastName: user.lastName,
        canonicalFullName: user.fullName,
        birthDate: user.birthDate,
        allowCrossOrgLinking: true,
        createdBy: userId,
      }).returning();

      // Create audit log
      await this.auditLog(newGlobalAthlete.id, "created", userId, "system", {
        email: verifiedEmail,
      });

      // Create auto-link - no notification needed as user is creating their own identity
      await this.createAutoLink(userId, newGlobalAthlete.id, verifiedEmail, user, null);
    } else {
      // Global athlete exists but has disabled cross-org linking
      // Create a new separate global athlete for this user
      const [newGlobalAthlete] = await db.insert(globalAthletes).values({
        verifiedEmails: [verifiedEmail],
        primaryEmail: verifiedEmail,
        canonicalFirstName: user.firstName,
        canonicalLastName: user.lastName,
        canonicalFullName: user.fullName,
        birthDate: user.birthDate,
        allowCrossOrgLinking: true,
        createdBy: userId,
      }).returning();

      await this.auditLog(newGlobalAthlete.id, "created", userId, "system", {
        email: verifiedEmail,
        reason: "existing_global_athlete_disabled_linking",
      });

      await this.createAutoLink(userId, newGlobalAthlete.id, verifiedEmail, user, null);
    }
  }

  /**
   * Find a global athlete by verified email
   */
  private async findByVerifiedEmail(email: string): Promise<GlobalAthlete | null> {
    const [found] = await db.select()
      .from(globalAthletes)
      .where(eq(globalAthletes.primaryEmail, email));

    return found || null;
  }

  /**
   * Create an auto-link between user and global athlete
   * @param existingGlobalAthlete - If set, user is joining an existing identity (send notification)
   */
  private async createAutoLink(
    userId: string,
    globalAthleteId: string,
    email: string,
    user: { fullName: string; emails: string[] },
    existingGlobalAthlete: GlobalAthlete | null
  ): Promise<void> {
    const shouldNotify = existingGlobalAthlete !== null;

    await db.insert(userGlobalAthleteLinks).values({
      userId,
      globalAthleteId,
      linkStatus: "confirmed",
      linkType: "auto_email",
      proposedBy: userId,
      confirmedBy: userId,
      confirmedAt: new Date(),
      shareMeasurements: true,
      notifiedAt: shouldNotify ? new Date() : null,
    });

    // Audit log
    await this.auditLog(globalAthleteId, "link_confirmed", userId, "system", {
      linkType: "auto_email",
      verifiedEmail: email,
      userId,
    });

    // Backfill measurements
    await this.backfillMeasurements(userId, globalAthleteId);

    // Send notification if user is joining an existing global athlete identity
    if (shouldNotify && existingGlobalAthlete) {
      try {
        // Get organizations that are already linked to the global athlete
        const linkedOrganizations = await this.getOrganizationsForGlobalAthlete(globalAthleteId);

        await emailService.sendAccountLinkedNotification({
          email: email,
          userName: user.fullName,
          globalAthleteName: existingGlobalAthlete.canonicalFullName,
          linkedOrganizations: linkedOrganizations.map(org => org.name),
        });

        // Audit log for notification
        await this.auditLog(globalAthleteId, "link_notification_sent", userId, "system", {
          email,
          linkedOrganizations: linkedOrganizations.map(org => org.name),
        });
      } catch (error) {
        console.error("Failed to send account linked notification:", error);
        // Audit log for notification failure (but don't fail the link creation)
        await this.auditLog(globalAthleteId, "link_notification_failed", userId, "system", {
          email,
          error: error instanceof Error ? error.message : "Unknown error",
        }).catch(e => console.error("Failed to log notification failure:", e));
      }
    }
  }

  /**
   * Get organizations associated with a global athlete through linked users
   */
  private async getOrganizationsForGlobalAthlete(globalAthleteId: string): Promise<{ id: string; name: string }[]> {
    const linkedUsers = await this.getLinkedUsers(globalAthleteId, { confirmedOnly: true });
    const userIds = linkedUsers.map(l => l.userId);

    if (userIds.length === 0) return [];

    const orgs = await db
      .selectDistinct({
        id: organizations.id,
        name: organizations.name,
      })
      .from(userOrganizations)
      .innerJoin(organizations, eq(userOrganizations.organizationId, organizations.id))
      .where(inArray(userOrganizations.userId, userIds));

    return orgs;
  }

  /**
   * Get a user's global athlete link
   */
  async getUserGlobalAthleteLink(userId: string): Promise<UserGlobalAthleteLink | null> {
    const [link] = await db.select()
      .from(userGlobalAthleteLinks)
      .where(eq(userGlobalAthleteLinks.userId, userId));

    return link || null;
  }

  /**
   * Get a global athlete by ID
   */
  async getGlobalAthlete(globalAthleteId: string): Promise<GlobalAthlete | null> {
    const [globalAthlete] = await db.select()
      .from(globalAthletes)
      .where(eq(globalAthletes.id, globalAthleteId));

    return globalAthlete || null;
  }

  /**
   * Get all linked users for a global athlete
   */
  async getLinkedUsers(
    globalAthleteId: string,
    options: LinkedUserOptions = {}
  ): Promise<UserGlobalAthleteLink[]> {
    const { shareMeasurementsOnly = false, confirmedOnly = true } = options;

    const conditions = [eq(userGlobalAthleteLinks.globalAthleteId, globalAthleteId)];

    if (confirmedOnly) {
      conditions.push(eq(userGlobalAthleteLinks.linkStatus, "confirmed"));
    }

    if (shareMeasurementsOnly) {
      conditions.push(eq(userGlobalAthleteLinks.shareMeasurements, true));
    }

    return db.select()
      .from(userGlobalAthleteLinks)
      .where(and(...conditions));
  }

  /**
   * Get unified measurements across all linked accounts for a user
   */
  async getUnifiedMeasurements(userId: string): Promise<any[]> {
    const link = await this.getUserGlobalAthleteLink(userId);

    if (!link || link.linkStatus !== "confirmed") {
      return [];
    }

    // Get all linked users who share measurements
    const linkedUsers = await this.getLinkedUsers(link.globalAthleteId, {
      shareMeasurementsOnly: true,
      confirmedOnly: true,
    });

    if (linkedUsers.length === 0) {
      return [];
    }

    const linkedUserIds = linkedUsers.map((l) => l.userId);

    // Query measurements for all linked users
    return db.select()
      .from(measurements)
      .where(inArray(measurements.userId, linkedUserIds))
      .orderBy(desc(measurements.date));
  }

  /**
   * Update privacy settings for a global athlete
   */
  async updatePrivacySettings(
    globalAthleteId: string,
    actorUserId: string,
    settings: PrivacySettings
  ): Promise<void> {
    const { allowCrossOrgLinking } = settings;

    if (allowCrossOrgLinking !== undefined) {
      // Update the global athlete
      await db.update(globalAthletes)
        .set({
          allowCrossOrgLinking,
          updatedAt: new Date(),
        })
        .where(eq(globalAthletes.id, globalAthleteId));

      // If disabling cross-org linking, revoke other links
      if (!allowCrossOrgLinking) {
        await db.update(userGlobalAthleteLinks)
          .set({ linkStatus: "revoked" })
          .where(and(
            eq(userGlobalAthleteLinks.globalAthleteId, globalAthleteId),
            ne(userGlobalAthleteLinks.userId, actorUserId)
          ));
      }

      // Audit log
      await this.auditLog(globalAthleteId, "privacy_changed", actorUserId, "athlete", {
        allowCrossOrgLinking,
      });
    }
  }

  /**
   * Backfill globalAthleteId on existing measurements for a user
   */
  private async backfillMeasurements(
    userId: string,
    globalAthleteId: string
  ): Promise<void> {
    await db.update(measurements)
      .set({ globalAthleteId })
      .where(eq(measurements.userId, userId));
  }

  /**
   * Create an audit log entry
   */
  private async auditLog(
    globalAthleteId: string,
    action: string,
    actorId: string | null,
    actorType: "athlete" | "org_admin" | "site_admin" | "system",
    details: Record<string, any> = {}
  ): Promise<void> {
    await db.insert(globalAthleteAuditLog).values({
      globalAthleteId,
      action,
      actorId,
      actorType,
      details,
    });
  }

  /**
   * Get pending link notifications for a user
   * Returns notifications where notifiedAt is set but notificationAcknowledgedAt is null
   */
  async getPendingLinkNotifications(userId: string): Promise<{
    linkId: string;
    linkedToName: string;
    linkedOrganizations: string[];
    notifiedAt: Date;
  }[]> {
    // Get user's link
    const link = await this.getUserGlobalAthleteLink(userId);
    if (!link) {
      return [];
    }

    // Check if this is a notified link (not the first user)
    if (!link.notifiedAt || link.notificationAcknowledgedAt) {
      return [];
    }

    // Get the global athlete
    const globalAthlete = await this.getGlobalAthlete(link.globalAthleteId);
    if (!globalAthlete) {
      return [];
    }

    // Get linked organizations
    const orgs = await this.getOrganizationsForGlobalAthlete(link.globalAthleteId);

    return [{
      linkId: link.id,
      linkedToName: globalAthlete.canonicalFullName,
      linkedOrganizations: orgs.map(o => o.name),
      notifiedAt: link.notifiedAt,
    }];
  }

  /**
   * Acknowledge a notification for a link
   */
  async acknowledgeNotification(userId: string, linkId: string): Promise<void> {
    // First verify the link belongs to this user
    const [link] = await db.select()
      .from(userGlobalAthleteLinks)
      .where(eq(userGlobalAthleteLinks.id, linkId));

    if (!link) {
      throw new Error("Link not found");
    }

    if (link.userId !== userId) {
      throw new Error("Not authorized to acknowledge this notification");
    }

    // Update the acknowledgment timestamp
    await db.update(userGlobalAthleteLinks)
      .set({ notificationAcknowledgedAt: new Date() })
      .where(eq(userGlobalAthleteLinks.id, linkId));

    // Audit log
    await this.auditLog(link.globalAthleteId, "notification_acknowledged", userId, "athlete", {
      linkId,
    });
  }

  /**
   * Update sharing settings for a link
   */
  async updateSharingSettings(userId: string, shareMeasurements: boolean): Promise<void> {
    const link = await this.getUserGlobalAthleteLink(userId);
    if (!link) {
      throw new Error("User does not have a global athlete link");
    }

    await db.update(userGlobalAthleteLinks)
      .set({ shareMeasurements })
      .where(eq(userGlobalAthleteLinks.userId, userId));

    await this.auditLog(link.globalAthleteId, "sharing_settings_changed", userId, "athlete", {
      shareMeasurements,
    });
  }

  // ========== ADMIN METHODS ==========

  /**
   * Get all global athletes with linked user counts (admin only)
   */
  async getAllGlobalAthletes(options: {
    limit?: number;
    offset?: number;
    search?: string;
  } = {}): Promise<Array<GlobalAthlete & { linkedUserCount: number }>> {
    const { limit = 50, offset = 0, search } = options;

    // Build query
    let query = db.select({
      id: globalAthletes.id,
      verifiedEmails: globalAthletes.verifiedEmails,
      primaryEmail: globalAthletes.primaryEmail,
      canonicalFirstName: globalAthletes.canonicalFirstName,
      canonicalLastName: globalAthletes.canonicalLastName,
      canonicalFullName: globalAthletes.canonicalFullName,
      birthDate: globalAthletes.birthDate,
      allowCrossOrgLinking: globalAthletes.allowCrossOrgLinking,
      createdBy: globalAthletes.createdBy,
      createdAt: globalAthletes.createdAt,
      updatedAt: globalAthletes.updatedAt,
    })
      .from(globalAthletes)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(globalAthletes.createdAt));

    // Add search filter if provided
    if (search) {
      // Escape SQL LIKE wildcards to prevent injection
      const escapedSearch = search
        .replace(/\\/g, '\\\\')  // Escape backslashes first
        .replace(/%/g, '\\%')    // Escape percent signs
        .replace(/_/g, '\\_');   // Escape underscores

      query = query.where(
        or(
          ilike(globalAthletes.primaryEmail, `%${escapedSearch}%`),
          ilike(globalAthletes.canonicalFullName, `%${escapedSearch}%`)
        )
      ) as typeof query;
    }

    const athletes = await query;

    // Get linked user counts for each athlete
    const athleteIds = athletes.map(a => a.id);
    if (athleteIds.length === 0) return [];

    const linkCounts = await db.select({
      globalAthleteId: userGlobalAthleteLinks.globalAthleteId,
      count: count(),
    })
      .from(userGlobalAthleteLinks)
      .where(and(
        inArray(userGlobalAthleteLinks.globalAthleteId, athleteIds),
        eq(userGlobalAthleteLinks.linkStatus, "confirmed")
      ))
      .groupBy(userGlobalAthleteLinks.globalAthleteId);

    const countMap = new Map(linkCounts.map(c => [c.globalAthleteId, Number(c.count)]));

    return athletes.map(a => ({
      ...a,
      linkedUserCount: countMap.get(a.id) || 0,
    }));
  }

  /**
   * Get detailed information about a global athlete (admin only)
   */
  async getGlobalAthleteDetails(globalAthleteId: string): Promise<{
    globalAthlete: GlobalAthlete;
    linkedUsers: Array<{
      userId: string;
      linkStatus: string;
      linkType: string;
      shareMeasurements: boolean;
      confirmedAt: Date | null;
      organizations: Array<{ id: string; name: string; role: string }>;
    }>;
    auditLog: Array<{
      id: string;
      action: string;
      actorType: string;
      actorId: string | null;
      details: any;
      createdAt: Date;
    }>;
  } | null> {
    // Get global athlete
    const globalAthlete = await this.getGlobalAthlete(globalAthleteId);
    if (!globalAthlete) return null;

    // Get linked users
    const linkedUsers = await this.getLinkedUsers(globalAthleteId, { confirmedOnly: false });

    // Get organization details for each linked user
    const linkedUsersWithOrgs = await Promise.all(
      linkedUsers.map(async (link) => {
        const userOrgs = await db.select({
          organizationId: userOrganizations.organizationId,
          role: userOrganizations.role,
          orgName: organizations.name,
        })
          .from(userOrganizations)
          .leftJoin(organizations, eq(organizations.id, userOrganizations.organizationId))
          .where(eq(userOrganizations.userId, link.userId));

        return {
          userId: link.userId,
          linkStatus: link.linkStatus,
          linkType: link.linkType,
          shareMeasurements: link.shareMeasurements,
          confirmedAt: link.confirmedAt,
          organizations: userOrgs.map(org => ({
            id: org.organizationId,
            name: org.orgName || "Unknown",
            role: org.role,
          })),
        };
      })
    );

    // Get audit log
    const auditLog = await db.select()
      .from(globalAthleteAuditLog)
      .where(eq(globalAthleteAuditLog.globalAthleteId, globalAthleteId))
      .orderBy(desc(globalAthleteAuditLog.createdAt))
      .limit(100);

    return {
      globalAthlete,
      linkedUsers: linkedUsersWithOrgs,
      auditLog: auditLog.map(log => ({
        id: log.id,
        action: log.action,
        actorType: log.actorType,
        actorId: log.actorId,
        details: log.details,
        createdAt: log.createdAt,
      })),
    };
  }

  /**
   * Admin force unlink a user from a global athlete
   */
  async adminForceUnlink(
    globalAthleteId: string,
    userId: string,
    adminUserId: string
  ): Promise<void> {
    // Delete the link
    await db.delete(userGlobalAthleteLinks)
      .where(and(
        eq(userGlobalAthleteLinks.globalAthleteId, globalAthleteId),
        eq(userGlobalAthleteLinks.userId, userId)
      ));

    // Audit log
    await this.auditLog(globalAthleteId, "admin_force_unlink", adminUserId, "site_admin", {
      unlinkedUserId: userId,
    });
  }

  /**
   * Admin update privacy settings for a global athlete
   */
  async adminUpdatePrivacySettings(
    globalAthleteId: string,
    adminUserId: string,
    settings: PrivacySettings
  ): Promise<void> {
    const { allowCrossOrgLinking } = settings;

    if (allowCrossOrgLinking !== undefined) {
      await db.update(globalAthletes)
        .set({
          allowCrossOrgLinking,
          updatedAt: new Date(),
        })
        .where(eq(globalAthletes.id, globalAthleteId));

      // Audit log
      await this.auditLog(globalAthleteId, "admin_privacy_changed", adminUserId, "site_admin", {
        allowCrossOrgLinking,
      });
    }
  }

  /**
   * Get aggregate statistics for admin dashboard
   */
  async getGlobalAthleteStats(): Promise<{
    totalGlobalAthletes: number;
    totalLinkedUsers: number;
    athletesWithMultipleLinks: number;
    recentLinkCount: number;
  }> {
    // Total global athletes
    const [totalResult] = await db.select({ count: count() })
      .from(globalAthletes);

    // Total linked users
    const [linksResult] = await db.select({ count: count() })
      .from(userGlobalAthleteLinks)
      .where(eq(userGlobalAthleteLinks.linkStatus, "confirmed"));

    // Athletes with multiple links
    const multiLinkResult = await db.select({
      globalAthleteId: userGlobalAthleteLinks.globalAthleteId,
      count: count(),
    })
      .from(userGlobalAthleteLinks)
      .where(eq(userGlobalAthleteLinks.linkStatus, "confirmed"))
      .groupBy(userGlobalAthleteLinks.globalAthleteId);

    const athletesWithMultipleLinks = multiLinkResult.filter(r => Number(r.count) > 1).length;

    // Recent links (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [recentResult] = await db.select({ count: count() })
      .from(userGlobalAthleteLinks)
      .where(and(
        eq(userGlobalAthleteLinks.linkStatus, "confirmed"),
        sql`${userGlobalAthleteLinks.confirmedAt} > ${sevenDaysAgo.toISOString()}`
      ));

    return {
      totalGlobalAthletes: Number(totalResult.count),
      totalLinkedUsers: Number(linksResult.count),
      athletesWithMultipleLinks,
      recentLinkCount: Number(recentResult.count),
    };
  }

  // ========== CLAIM METHODS ==========

  /**
   * Initiate a claim request to link an additional email address
   * Sends verification email to the claimed address
   */
  async initiateClaimRequest(userId: string, emailToClaim: string): Promise<{ success: boolean; token: string }> {
    // Get user's global athlete link
    const link = await this.getUserGlobalAthleteLink(userId);
    if (!link) {
      throw new Error("User does not have a global athlete profile");
    }

    // Get user details for the email
    const user = await this.storage.getUser(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Check if there's already a pending claim for this email
    const [existingPendingClaim] = await db.select()
      .from(globalAthleteClaims)
      .where(and(
        eq(globalAthleteClaims.globalAthleteId, link.globalAthleteId),
        eq(globalAthleteClaims.claimedEmail, emailToClaim),
        eq(globalAthleteClaims.status, "pending")
      ));

    if (existingPendingClaim) {
      throw new Error("A claim for this email is already pending");
    }

    // Check if the email belongs to another global athlete that has disabled linking
    const existingGlobalAthlete = await this.findByVerifiedEmail(emailToClaim);
    if (existingGlobalAthlete && !existingGlobalAthlete.allowCrossOrgLinking) {
      throw new Error("The owner of this email has disabled cross-organization linking");
    }

    // Generate a secure token
    const token = crypto.randomBytes(32).toString("hex");

    // Set expiry to 24 hours from now
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Create the claim record
    await db.insert(globalAthleteClaims).values({
      globalAthleteId: link.globalAthleteId,
      claimedEmail: emailToClaim,
      token,
      status: "pending",
      expiresAt,
    });

    // Audit log
    await this.auditLog(link.globalAthleteId, "claim_initiated", userId, "athlete", {
      claimedEmail: emailToClaim,
    });

    // Send verification email
    const baseUrl = process.env.BASE_URL;
    if (!baseUrl) {
      console.error("BASE_URL environment variable is not configured");
      throw new Error("Email service is not properly configured");
    }
    const verificationLink = `${baseUrl}/verify-claim?token=${token}`;

    await emailService.sendClaimVerificationEmail({
      email: emailToClaim,
      userName: user.fullName,
      verificationLink,
    });

    return { success: true, token };
  }

  /**
   * Verify a claim token and add the email to the global athlete
   */
  async verifyClaim(token: string): Promise<{ success: boolean; message: string }> {
    // Generic error message to prevent token enumeration
    const invalidTokenMessage = "Invalid or expired verification link";

    // Find the claim by token
    const [claim] = await db.select()
      .from(globalAthleteClaims)
      .where(eq(globalAthleteClaims.token, token));

    if (!claim) {
      return { success: false, message: invalidTokenMessage };
    }

    // Check if already verified
    if (claim.status === "verified") {
      return { success: false, message: invalidTokenMessage };
    }

    // Check if expired
    if (new Date() > claim.expiresAt) {
      // Mark as expired
      await db.update(globalAthleteClaims)
        .set({ status: "expired" })
        .where(eq(globalAthleteClaims.id, claim.id));

      return { success: false, message: invalidTokenMessage };
    }

    // Check if cancelled
    if (claim.status === "cancelled") {
      return { success: false, message: invalidTokenMessage };
    }

    // Get the global athlete
    const globalAthlete = await this.getGlobalAthlete(claim.globalAthleteId);
    if (!globalAthlete) {
      return { success: false, message: invalidTokenMessage };
    }

    // Add the email to the global athlete's verified emails
    const updatedEmails = [...(globalAthlete.verifiedEmails || []), claim.claimedEmail];
    await db.update(globalAthletes)
      .set({
        verifiedEmails: updatedEmails,
        updatedAt: new Date(),
      })
      .where(eq(globalAthletes.id, claim.globalAthleteId));

    // Update the claim status
    await db.update(globalAthleteClaims)
      .set({
        status: "verified",
        verifiedAt: new Date(),
      })
      .where(eq(globalAthleteClaims.id, claim.id));

    // Audit log
    await this.auditLog(claim.globalAthleteId, "claim_verified", null, "system", {
      claimedEmail: claim.claimedEmail,
    });

    return { success: true, message: "Email successfully verified and linked to your account" };
  }

  /**
   * Get pending claims for a user
   */
  async getPendingClaims(userId: string): Promise<GlobalAthleteClaim[]> {
    const link = await this.getUserGlobalAthleteLink(userId);
    if (!link) {
      return [];
    }

    return db.select()
      .from(globalAthleteClaims)
      .where(and(
        eq(globalAthleteClaims.globalAthleteId, link.globalAthleteId),
        eq(globalAthleteClaims.status, "pending")
      ));
  }

  /**
   * Cancel a pending claim
   */
  async cancelClaim(userId: string, claimId: string): Promise<void> {
    // Get user's global athlete link
    const link = await this.getUserGlobalAthleteLink(userId);
    if (!link) {
      throw new Error("User does not have a global athlete profile");
    }

    // Get the claim
    const [claim] = await db.select()
      .from(globalAthleteClaims)
      .where(eq(globalAthleteClaims.id, claimId));

    if (!claim) {
      throw new Error("Claim not found");
    }

    // Verify the claim belongs to this user's global athlete
    if (claim.globalAthleteId !== link.globalAthleteId) {
      throw new Error("Not authorized to cancel this claim");
    }

    // Update the claim status
    await db.update(globalAthleteClaims)
      .set({ status: "cancelled" })
      .where(eq(globalAthleteClaims.id, claimId));

    // Audit log
    await this.auditLog(link.globalAthleteId, "claim_cancelled", userId, "athlete", {
      claimId,
      claimedEmail: claim.claimedEmail,
    });
  }
}

// Export singleton instance
export const globalAthleteService = new GlobalAthleteService();
