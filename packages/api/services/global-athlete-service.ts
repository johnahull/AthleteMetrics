/**
 * Service for managing cross-organization athlete identity linking
 */

import { db } from "../db";
import {
  globalAthletes, userGlobalAthleteLinks, globalAthleteAuditLog,
  users, measurements,
  type GlobalAthlete, type UserGlobalAthleteLink
} from "@shared/schema";
import { eq, and, inArray, desc, ne } from "drizzle-orm";
import { BaseService } from "./base-service";

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
      // Auto-link to existing global athlete
      await this.createAutoLink(userId, existingGlobalAthlete.id, verifiedEmail);
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

      // Create auto-link
      await this.createAutoLink(userId, newGlobalAthlete.id, verifiedEmail);
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

      await this.createAutoLink(userId, newGlobalAthlete.id, verifiedEmail);
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
   */
  private async createAutoLink(
    userId: string,
    globalAthleteId: string,
    email: string
  ): Promise<void> {
    await db.insert(userGlobalAthleteLinks).values({
      userId,
      globalAthleteId,
      linkStatus: "confirmed",
      linkType: "auto_email",
      proposedBy: userId,
      confirmedBy: userId,
      confirmedAt: new Date(),
      shareMeasurements: true,
    });

    // Audit log
    await this.auditLog(globalAthleteId, "link_confirmed", userId, "system", {
      linkType: "auto_email",
      verifiedEmail: email,
      userId,
    });

    // Backfill measurements
    await this.backfillMeasurements(userId, globalAthleteId);
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
}

// Export singleton instance
export const globalAthleteService = new GlobalAthleteService();
