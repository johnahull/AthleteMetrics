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
import { hashToken } from "../lib/token-hash";
import { eq, and, inArray, desc, ne, isNull, isNotNull, count, sql, ilike, or } from "drizzle-orm";
import { BaseService } from "./base-service";
import { emailService } from "./email-service";
import { getPgErrorCode, getPgError, PG_UNIQUE_VIOLATION } from "../lib/pg-error";

export interface PrivacySettings {
  allowCrossOrgLinking?: boolean;
}

export interface LinkedUserOptions {
  shareMeasurementsOnly?: boolean;
  confirmedOnly?: boolean;
}

// Constants for configuration
const MAX_AUDIT_LOG_ENTRIES = 100;
const MAX_ATHLETES_FOR_LINK_FILTER = 10000;
const CLAIM_TOKEN_EXPIRY_HOURS = 24;

export class GlobalAthleteService extends BaseService {
  /**
   * Link an athlete by email without requiring email verification.
   * Called automatically when athletes are created or imported.
   * Skips placeholder emails (@temp.local, @ocr-import.local).
   */
  async linkAthleteByEmail(userId: string, email: string): Promise<void> {
    // Skip placeholder/temp emails - these are not real emails
    if (!email ||
        email.endsWith('@temp.local') ||
        email.endsWith('@ocr-import.local') ||
        email.includes('@placeholder.')) {
      return;
    }

    // Normalize email to lowercase for consistent matching
    const normalizedEmail = email.toLowerCase().trim();

    // Delegate to the core linking logic
    await this.linkAthleteToGlobalAthlete(userId, normalizedEmail, 'auto_import');
  }

  /**
   * Called when a user verifies their email address.
   * Creates or links to existing global athlete identity.
   */
  async onEmailVerified(userId: string, verifiedEmail: string): Promise<void> {
    await this.linkAthleteToGlobalAthlete(userId, verifiedEmail.toLowerCase().trim(), 'auto_email');
  }

  /**
   * Core linking logic - finds or creates global athlete and links user.
   * Used by both linkAthleteByEmail (import) and onEmailVerified (verification).
   */
  private async linkAthleteToGlobalAthlete(
    userId: string,
    email: string,
    linkType: 'auto_email' | 'auto_import'
  ): Promise<void> {
    // Check if user already has a global athlete link
    const existingLink = await this.getUserGlobalAthleteLink(userId);
    if (existingLink) {
      // User already linked - skip
      return;
    }

    // Get user details for canonical profile
    const user = await this.storage.getUser(userId);
    if (!user) {
      // Silently skip if user not found (e.g., during import race conditions)
      console.warn(`linkAthleteToGlobalAthlete: User not found: ${userId}`);
      return;
    }

    // Check if a global athlete exists with this email
    const existingGlobalAthlete = await this.findByVerifiedEmail(email);

    if (existingGlobalAthlete && existingGlobalAthlete.allowCrossOrgLinking) {
      // Auto-link to existing global athlete - user is joining an existing identity
      await this.createAutoLink(userId, existingGlobalAthlete.id, email, user, existingGlobalAthlete, linkType);
    } else if (!existingGlobalAthlete) {
      // Create new global athlete
      try {
        const [newGlobalAthlete] = await db.insert(globalAthletes).values({
          verifiedEmails: [email],
          primaryEmail: email,
          canonicalFirstName: user.firstName,
          canonicalLastName: user.lastName,
          canonicalFullName: user.fullName,
          birthDate: user.birthDate,
          allowCrossOrgLinking: true,
          createdBy: userId,
        }).returning();

        // Create audit log
        await this.auditLog(newGlobalAthlete.id, "created", userId, "system", {
          email,
          linkType,
        });

        // Create auto-link - no notification needed as user is creating their own identity
        await this.createAutoLink(userId, newGlobalAthlete.id, email, user, null, linkType);
      } catch (error: any) {
        // Handle race condition: another process created the global athlete
        const pgError = getPgError(error);
        if (pgError?.code === PG_UNIQUE_VIOLATION && pgError?.constraint?.includes('primary_email')) {
          // Unique violation on primary_email - fetch the newly created global athlete
          const existing = await this.findByVerifiedEmail(email);
          if (existing && existing.allowCrossOrgLinking) {
            // Link to the global athlete that was just created by another process
            await this.createAutoLink(userId, existing.id, email, user, existing, linkType);
          } else if (existing) {
            // The global athlete created by another process has disabled linking
            // This is a rare edge case - log and skip
            console.warn(`Race condition: global athlete created with linking disabled for ${email}`);
          }
        } else {
          // Not a race condition - rethrow
          throw error;
        }
      }
    } else {
      // Global athlete exists but has disabled cross-org linking
      // Create a new separate global athlete for this user.
      // We do NOT set primaryEmail here because the unique constraint on
      // primaryEmail prevents two global athletes from sharing the same email
      // address. PostgreSQL allows multiple NULLs in a UNIQUE column, so
      // leaving primaryEmail null creates a valid isolated identity.
      // The verifiedEmails array still records the email for audit purposes.
      //
      // Lookup safety: findByVerifiedEmail() always searches BOTH primaryEmail
      // (for performance) AND the verifiedEmails array as a fallback, so athletes
      // with primaryEmail = null are still discoverable by email through the array
      // check. All callers that need to locate a global athlete by email must use
      // findByVerifiedEmail() — never query primaryEmail in isolation.
      const [newGlobalAthlete] = await db.insert(globalAthletes).values({
        verifiedEmails: [email],
        canonicalFirstName: user.firstName,
        canonicalLastName: user.lastName,
        canonicalFullName: user.fullName,
        birthDate: user.birthDate,
        allowCrossOrgLinking: true,
        createdBy: userId,
      }).returning();

      await this.auditLog(newGlobalAthlete.id, "created", userId, "system", {
        email,
        linkType,
        reason: "existing_global_athlete_disabled_linking",
      });

      await this.createAutoLink(userId, newGlobalAthlete.id, email, user, null, linkType);
    }
  }

  /**
   * Find a global athlete by verified email
   * Searches both primaryEmail and verifiedEmails array
   */
  private async findByVerifiedEmail(email: string): Promise<GlobalAthlete | null> {
    // First try to find by primary email for performance
    const [foundByPrimary] = await db.select()
      .from(globalAthletes)
      .where(eq(globalAthletes.primaryEmail, email));

    if (foundByPrimary) {
      return foundByPrimary;
    }

    // If not found by primary, search the verifiedEmails array
    // Use SQL placeholder to properly parameterize the email value
    const [foundByArray] = await db.select()
      .from(globalAthletes)
      .where(sql`${sql.placeholder('email')}::text = ANY(${globalAthletes.verifiedEmails})`)
      .execute({ email });

    return foundByArray || null;
  }

  /**
   * Create an auto-link between user and global athlete
   * @param existingGlobalAthlete - If set, user is joining an existing identity (send notification)
   * @param linkType - The type of link: 'auto_email' for email verification, 'auto_import' for import
   */
  private async createAutoLink(
    userId: string,
    globalAthleteId: string,
    email: string,
    user: { fullName: string; emails: string[] },
    existingGlobalAthlete: GlobalAthlete | null,
    linkType: 'auto_email' | 'auto_import' = 'auto_email'
  ): Promise<void> {
    const shouldNotify = existingGlobalAthlete !== null;

    await db.insert(userGlobalAthleteLinks).values({
      userId,
      globalAthleteId,
      linkStatus: "confirmed",
      linkType,
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
   * @param options.limit - Max results to return (default: 50, max: 200)
   * @param options.offset - Number of results to skip for pagination
   * @param options.search - Filter by email or name (case-insensitive, min 2 chars)
   * @param options.hasMultipleLinks - Filter by link count: true = 2+ links, false = <2 links
   * @param options.allowCrossOrgLinking - Filter by cross-org linking setting
   * @returns athletes array and totalCount for pagination
   */
  async getAllGlobalAthletes(options: {
    limit?: number;
    offset?: number;
    search?: string;
    hasMultipleLinks?: boolean;
    allowCrossOrgLinking?: boolean;
  } = {}): Promise<{ athletes: Array<GlobalAthlete & { linkedUserCount: number }>; totalCount: number; warning?: string }> {
    // Validate and sanitize inputs
    const limit = Math.min(Math.max(options.limit || 50, 1), 200);
    const offset = Math.max(options.offset || 0, 0);
    const { search, hasMultipleLinks, allowCrossOrgLinking } = options;

    // Build conditions array
    const conditions: ReturnType<typeof eq>[] = [];

    // Add search filter if provided (min 2 chars to prevent trivial searches)
    if (search && search.length >= 2) {
      // Escape SQL LIKE wildcards to prevent injection
      const escapedSearch = search
        .substring(0, 100) // Limit search length
        .replace(/\\/g, '\\\\')  // Escape backslashes first
        .replace(/%/g, '\\%')    // Escape percent signs
        .replace(/_/g, '\\_');   // Escape underscores

      // Search both primaryEmail AND verifiedEmails array. Athletes created
      // with cross-org linking disabled have primaryEmail = null, so searching
      // only primaryEmail would miss them. The unnest fallback ensures all
      // athletes are discoverable by email regardless of primaryEmail state.
      conditions.push(
        or(
          ilike(globalAthletes.primaryEmail, `%${escapedSearch}%`),
          sql`EXISTS (SELECT 1 FROM unnest(${globalAthletes.verifiedEmails}) e WHERE e ILIKE ${'%' + escapedSearch + '%'})`,
          ilike(globalAthletes.canonicalFullName, `%${escapedSearch}%`)
        ) as ReturnType<typeof eq>
      );
    }

    // Add allowCrossOrgLinking filter if provided
    if (allowCrossOrgLinking !== undefined) {
      conditions.push(eq(globalAthletes.allowCrossOrgLinking, allowCrossOrgLinking));
    }

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
      .orderBy(desc(globalAthletes.createdAt));

    // Apply conditions if any
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    // For hasMultipleLinks filter, we need to get all athletes first and filter after
    // because we need to count links to determine which have multiple
    if (hasMultipleLinks !== undefined) {
      // Safeguard: limit query to prevent memory issues at scale
      const allAthletes = await query.limit(MAX_ATHLETES_FOR_LINK_FILTER);

      if (allAthletes.length === 0) {
        return { athletes: [], totalCount: 0 };
      }

      // Check if we hit the limit and warn the user
      const hitLimit = allAthletes.length === MAX_ATHLETES_FOR_LINK_FILTER;
      const warning = hitLimit
        ? `Results limited to ${MAX_ATHLETES_FOR_LINK_FILTER} athletes. Use additional filters to narrow results.`
        : undefined;

      // Get linked user counts for all athletes
      const allAthleteIds = allAthletes.map(a => a.id);
      const linkCounts = await db.select({
        globalAthleteId: userGlobalAthleteLinks.globalAthleteId,
        count: count(),
      })
        .from(userGlobalAthleteLinks)
        .where(and(
          inArray(userGlobalAthleteLinks.globalAthleteId, allAthleteIds),
          eq(userGlobalAthleteLinks.linkStatus, "confirmed")
        ))
        .groupBy(userGlobalAthleteLinks.globalAthleteId);

      const countMap = new Map(linkCounts.map(c => [c.globalAthleteId, Number(c.count)]));

      // Filter by link count
      const filteredAthletes = allAthletes.filter(a => {
        const linkCount = countMap.get(a.id) || 0;
        if (hasMultipleLinks) {
          return linkCount >= 2;
        } else {
          return linkCount < 2;
        }
      });

      const totalCount = filteredAthletes.length;

      // Apply pagination
      const paginatedAthletes = filteredAthletes.slice(offset, offset + limit);

      return {
        athletes: paginatedAthletes.map(a => ({
          ...a,
          linkedUserCount: countMap.get(a.id) || 0,
        })),
        totalCount,
        ...(warning && { warning }),
      };
    }

    // Standard pagination when not filtering by link count
    // First get total count for pagination
    let countQuery = db.select({ count: count() }).from(globalAthletes);
    if (conditions.length > 0) {
      countQuery = countQuery.where(and(...conditions)) as typeof countQuery;
    }
    const [countResult] = await countQuery;
    const totalCount = Number(countResult.count);

    const athletes = await query.limit(limit).offset(offset);

    // Get linked user counts for each athlete
    const athleteIds = athletes.map(a => a.id);
    if (athleteIds.length === 0) {
      return { athletes: [], totalCount };
    }

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

    return {
      athletes: athletes.map(a => ({
        ...a,
        linkedUserCount: countMap.get(a.id) || 0,
      })),
      totalCount,
    };
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

    // Batch query: Get organization details for all linked users at once
    const userIds = linkedUsers.map(link => link.userId);
    const allUserOrgs = userIds.length > 0
      ? await db.select({
          userId: userOrganizations.userId,
          organizationId: userOrganizations.organizationId,
          role: userOrganizations.role,
          orgName: organizations.name,
        })
          .from(userOrganizations)
          .leftJoin(organizations, eq(organizations.id, userOrganizations.organizationId))
          .where(inArray(userOrganizations.userId, userIds))
      : [];

    // Group organizations by userId
    const orgsByUserId = new Map<string, Array<{ id: string; name: string; role: string }>>();
    for (const userOrg of allUserOrgs) {
      if (!orgsByUserId.has(userOrg.userId)) {
        orgsByUserId.set(userOrg.userId, []);
      }
      orgsByUserId.get(userOrg.userId)!.push({
        id: userOrg.organizationId,
        name: userOrg.orgName || "Unknown",
        role: userOrg.role,
      });
    }

    // Map linked users with their organizations
    const linkedUsersWithOrgs = linkedUsers.map(link => ({
      userId: link.userId,
      linkStatus: link.linkStatus,
      linkType: link.linkType,
      shareMeasurements: link.shareMeasurements,
      confirmedAt: link.confirmedAt,
      organizations: orgsByUserId.get(link.userId) || [],
    }));

    // Get audit log (limited to most recent entries)
    const auditLog = await db.select()
      .from(globalAthleteAuditLog)
      .where(eq(globalAthleteAuditLog.globalAthleteId, globalAthleteId))
      .orderBy(desc(globalAthleteAuditLog.createdAt))
      .limit(MAX_AUDIT_LOG_ENTRIES);

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

  /**
   * Backfill global athlete links for all existing athletes with real emails.
   * Groups athletes by email and links them to shared global athlete identities.
   * Returns statistics about the backfill operation.
   */
  async backfillAllAthleteLinks(): Promise<{
    processed: number;
    linked: number;
    created: number;
    skipped: number;
    errors: string[];
  }> {
    const stats = { processed: 0, linked: 0, created: 0, skipped: 0, errors: [] as string[] };

    // Get all athletes (users who have role='athlete' in any organization)
    // Use a subquery to find distinct user IDs with athlete role
    const athleteUserIds = db
      .selectDistinct({ userId: userOrganizations.userId })
      .from(userOrganizations)
      .where(eq(userOrganizations.role, 'athlete'));

    const athletes = await db.select({
      id: users.id,
      emails: users.emails,
      firstName: users.firstName,
      lastName: users.lastName,
      fullName: users.fullName,
      birthDate: users.birthDate,
    })
      .from(users)
      .where(inArray(users.id, athleteUserIds));

    for (const athlete of athletes) {
      stats.processed++;

      // Get primary email
      const email = athlete.emails?.[0];
      if (!email ||
          email.endsWith('@temp.local') ||
          email.endsWith('@ocr-import.local') ||
          email.includes('@placeholder.')) {
        stats.skipped++;
        continue;
      }

      // Check if already linked
      const existingLink = await this.getUserGlobalAthleteLink(athlete.id);
      if (existingLink) {
        stats.skipped++;
        continue;
      }

      try {
        const normalizedEmail = email.toLowerCase().trim();

        // Check if global athlete exists for this email
        const existingGlobalAthlete = await this.findByVerifiedEmail(normalizedEmail);

        if (existingGlobalAthlete) {
          // Link to existing global athlete
          await this.createAutoLink(
            athlete.id,
            existingGlobalAthlete.id,
            normalizedEmail,
            { fullName: athlete.fullName || `${athlete.firstName} ${athlete.lastName}`, emails: athlete.emails || [] },
            existingGlobalAthlete,
            'auto_import'
          );
          stats.linked++;
        } else {
          // Create new global athlete
          const [newGlobalAthlete] = await db.insert(globalAthletes).values({
            verifiedEmails: [normalizedEmail],
            primaryEmail: normalizedEmail,
            canonicalFirstName: athlete.firstName,
            canonicalLastName: athlete.lastName,
            canonicalFullName: athlete.fullName || `${athlete.firstName} ${athlete.lastName}`,
            birthDate: athlete.birthDate,
            allowCrossOrgLinking: true,
            createdBy: athlete.id,
          }).returning();

          await this.auditLog(newGlobalAthlete.id, "created", athlete.id, "system", {
            email: normalizedEmail,
            linkType: 'auto_import',
            source: 'backfill',
          });

          await this.createAutoLink(
            athlete.id,
            newGlobalAthlete.id,
            normalizedEmail,
            { fullName: athlete.fullName || `${athlete.firstName} ${athlete.lastName}`, emails: athlete.emails || [] },
            null,
            'auto_import'
          );
          stats.created++;
        }
      } catch (error) {
        const errorMsg = `Failed to link athlete ${athlete.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(errorMsg);
        stats.errors.push(errorMsg);
      }
    }

    console.log(`Backfill complete: ${stats.processed} processed, ${stats.created} created, ${stats.linked} linked, ${stats.skipped} skipped, ${stats.errors.length} errors`);
    return stats;
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

    // Set expiry based on configured hours
    const expiresAt = new Date(Date.now() + CLAIM_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

    // Create the claim record
    await db.insert(globalAthleteClaims).values({
      globalAthleteId: link.globalAthleteId,
      claimedEmail: emailToClaim,
      token: hashToken(token), // Store only the hash; the raw token is emailed
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
      .where(eq(globalAthleteClaims.token, hashToken(token)));

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
