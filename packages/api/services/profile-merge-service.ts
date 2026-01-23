/**
 * Profile Merge Service
 *
 * Enables org admins to merge duplicate athlete profiles within their organization.
 * This addresses the scenario where a coach creates an athlete profile (Profile A)
 * and the same person later signs up with a different email (Profile B).
 *
 * Key design decisions:
 * - All operations use SERIALIZABLE transactions with row locking
 * - Historical references (submittedBy, verifiedBy, createdBy) are NOT modified
 * - Source user is soft-deleted after merge (preserving audit trail)
 * - Sessions are invalidated to force re-authentication
 * - Comprehensive audit logging for compliance
 */

import { BaseService } from "./base-service";
import { db } from "../db";
import { eq, and, sql, inArray } from "drizzle-orm";
import {
  users,
  measurements,
  userOrganizations,
  userTeams,
  goals,
  userAchievements,
  wellnessResponses,
  eventRegistrations,
  eventInvitations,
  reportShares,
  athleteProfiles,
  userGlobalAthleteLinks,
  pushSubscriptions,
  notificationPreferences,
  invitations,
  membershipRequests,
  sessions,
  emailVerificationTokens,
  accountLinkingTokens,
  auditLogs,
} from "@shared/schema";
import type { User } from "@shared/schema";

/**
 * Result of a merge preview operation
 */
export interface MergePreview {
  source: {
    id: string;
    fullName: string;
    emails: string[];
    measurementCount: number;
    teamMembershipCount: number;
    goalCount: number;
    achievementCount: number;
    wellnessResponseCount: number;
    eventRegistrationCount: number;
    hasGlobalAthleteLink: boolean;
    globalAthleteId?: string;
    oauthProviders: string[];
  };
  target: {
    id: string;
    fullName: string;
    emails: string[];
    measurementCount: number;
    teamMembershipCount: number;
    goalCount: number;
    achievementCount: number;
    wellnessResponseCount: number;
    eventRegistrationCount: number;
    hasGlobalAthleteLink: boolean;
    globalAthleteId?: string;
    oauthProviders: string[];
  };
  conflicts: MergeConflict[];
  warnings: string[];
  canMerge: boolean;
  blockingReason?: string;
}

/**
 * Represents a conflict that may occur during merge
 */
export interface MergeConflict {
  type: "measurement_same_date" | "team_membership_overlap" | "oauth_same_provider" | "global_athlete_different";
  description: string;
  sourceData?: any;
  targetData?: any;
  resolution?: "keep_both" | "keep_target" | "keep_source" | "blocked";
}

/**
 * Result of a completed merge operation
 */
export interface MergeResult {
  success: boolean;
  mergeId: string;
  summary: {
    measurementsTransferred: number;
    teamMembershipsTransferred: number;
    goalsTransferred: number;
    achievementsTransferred: number;
    wellnessResponsesTransferred: number;
    eventRegistrationsTransferred: number;
    emailsMerged: number;
    sessionsInvalidated: number;
  };
  auditLogId: string;
  targetUserId: string;
  sourceUserSoftDeleted: boolean;
}

/**
 * Options for the merge operation
 */
export interface MergeOptions {
  dryRun?: boolean;
  conflictResolution?: {
    measurementConflicts?: "keep_both" | "keep_target" | "keep_source";
    teamMembershipConflicts?: "merge_dates" | "keep_target";
  };
}

/**
 * Request context for audit logging
 */
interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

export class ProfileMergeService extends BaseService {
  /**
   * Preview what would happen if two profiles were merged
   * This is a read-only operation that shows the admin what data would be transferred
   */
  async previewMerge(
    orgId: string,
    sourceUserId: string,
    targetUserId: string,
    actorId: string
  ): Promise<MergePreview> {
    // Validate the actor has org admin access
    await this.validateMergeAuthorization(orgId, actorId);

    // Prevent merging a user with themselves
    if (sourceUserId === targetUserId) {
      throw new Error("Cannot merge a user with themselves");
    }

    // Validate both users exist and are in the organization
    const [sourceUser, targetUser] = await Promise.all([
      this.storage.getUser(sourceUserId),
      this.storage.getUser(targetUserId),
    ]);

    if (!sourceUser || sourceUser.deletedAt) {
      throw new Error("Source user not found or has been deleted");
    }
    if (!targetUser || targetUser.deletedAt) {
      throw new Error("Target user not found or has been deleted");
    }

    // Verify both are athletes in the organization
    await this.validateUsersAreOrgAthletes(orgId, sourceUserId, targetUserId);

    // Gather data counts for both profiles
    const [sourceData, targetData] = await Promise.all([
      this.gatherProfileData(sourceUserId, orgId),
      this.gatherProfileData(targetUserId, orgId),
    ]);

    // Detect conflicts
    const conflicts = await this.detectConflicts(sourceUserId, targetUserId, orgId, sourceUser, targetUser);

    // Determine if merge can proceed
    const blockingConflicts = conflicts.filter(c => c.resolution === "blocked");
    const canMerge = blockingConflicts.length === 0;
    const blockingReason = blockingConflicts.length > 0
      ? blockingConflicts.map(c => c.description).join("; ")
      : undefined;

    // Generate warnings (non-blocking issues)
    const warnings: string[] = [];
    if (sourceData.measurementCount > 0) {
      warnings.push(`${sourceData.measurementCount} measurements will be transferred to ${targetUser.fullName}`);
    }
    if (sourceData.hasGlobalAthleteLink && targetData.hasGlobalAthleteLink &&
        sourceData.globalAthleteId === targetData.globalAthleteId) {
      warnings.push("Both profiles are linked to the same Global Athlete - link will be consolidated");
    }

    return {
      source: {
        id: sourceUserId,
        fullName: sourceUser.fullName,
        emails: sourceUser.emails || [],
        ...sourceData,
        oauthProviders: this.getOAuthProviders(sourceUser),
      },
      target: {
        id: targetUserId,
        fullName: targetUser.fullName,
        emails: targetUser.emails || [],
        ...targetData,
        oauthProviders: this.getOAuthProviders(targetUser),
      },
      conflicts,
      warnings,
      canMerge,
      blockingReason,
    };
  }

  /**
   * Execute the profile merge operation
   * Transfers all data from source to target, then soft-deletes source
   */
  async mergeProfiles(
    orgId: string,
    sourceUserId: string,
    targetUserId: string,
    actorId: string,
    options: MergeOptions = {},
    context?: RequestContext
  ): Promise<MergeResult> {
    const mergeId = crypto.randomUUID();

    // Validate authorization
    await this.validateMergeAuthorization(orgId, actorId);

    // Validate users
    const [sourceUser, targetUser] = await Promise.all([
      this.storage.getUser(sourceUserId),
      this.storage.getUser(targetUserId),
    ]);

    if (!sourceUser || sourceUser.deletedAt) {
      throw new Error("Source user not found or has been deleted");
    }
    if (!targetUser || targetUser.deletedAt) {
      throw new Error("Target user not found or has been deleted");
    }

    // Cannot merge same user
    if (sourceUserId === targetUserId) {
      throw new Error("Cannot merge a user with themselves");
    }

    // Verify both are athletes in the organization
    await this.validateUsersAreOrgAthletes(orgId, sourceUserId, targetUserId);

    // Check for blocking conflicts
    const conflicts = await this.detectConflicts(sourceUserId, targetUserId, orgId, sourceUser, targetUser);
    const blockingConflicts = conflicts.filter(c => c.resolution === "blocked");
    if (blockingConflicts.length > 0) {
      throw new Error(`Cannot merge: ${blockingConflicts.map(c => c.description).join("; ")}`);
    }

    // If dry run, return preview data
    if (options.dryRun) {
      const sourceData = await this.gatherProfileData(sourceUserId, orgId);
      return {
        success: true,
        mergeId,
        summary: {
          measurementsTransferred: sourceData.measurementCount,
          teamMembershipsTransferred: sourceData.teamMembershipCount,
          goalsTransferred: sourceData.goalCount,
          achievementsTransferred: sourceData.achievementCount,
          wellnessResponsesTransferred: sourceData.wellnessResponseCount,
          eventRegistrationsTransferred: sourceData.eventRegistrationCount,
          emailsMerged: (sourceUser.emails || []).length,
          sessionsInvalidated: 0,
        },
        auditLogId: "dry-run",
        targetUserId,
        sourceUserSoftDeleted: false,
      };
    }

    // Execute merge in a serializable transaction
    const result = await db.transaction(async (tx) => {
      // Race condition check: Verify source user hasn't been deleted by another concurrent merge
      const [sourceUserCheck] = await tx.select({ deletedAt: users.deletedAt })
        .from(users)
        .where(eq(users.id, sourceUserId));

      if (!sourceUserCheck || sourceUserCheck.deletedAt) {
        throw new Error("Source user has already been deleted. Another merge may have completed.");
      }

      const summary = {
        measurementsTransferred: 0,
        teamMembershipsTransferred: 0,
        goalsTransferred: 0,
        achievementsTransferred: 0,
        wellnessResponsesTransferred: 0,
        eventRegistrationsTransferred: 0,
        emailsMerged: 0,
        sessionsInvalidated: 0,
      };

      // 1. Transfer measurements (update userId, keep submittedBy/verifiedBy unchanged)
      const measurementsResult = await tx.update(measurements)
        .set({ userId: targetUserId })
        .where(and(
          eq(measurements.userId, sourceUserId),
          eq(measurements.organizationId, orgId)
        ))
        .returning({ id: measurements.id });
      summary.measurementsTransferred = measurementsResult.length;

      // 2. Transfer team memberships (handle duplicates)
      const targetTeamMemberships = await tx.select({ teamId: userTeams.teamId })
        .from(userTeams)
        .where(eq(userTeams.userId, targetUserId));
      const targetTeamIds = new Set(targetTeamMemberships.map(m => m.teamId));

      const sourceTeamMemberships = await tx.select()
        .from(userTeams)
        .where(eq(userTeams.userId, sourceUserId));

      for (const membership of sourceTeamMemberships) {
        if (targetTeamIds.has(membership.teamId)) {
          // Delete duplicate membership
          await tx.delete(userTeams).where(eq(userTeams.id, membership.id));
        } else {
          // Transfer membership to target
          await tx.update(userTeams)
            .set({ userId: targetUserId })
            .where(eq(userTeams.id, membership.id));
          summary.teamMembershipsTransferred++;
        }
      }

      // 3. Transfer goals (skip duplicate metrics)
      const targetGoals = await tx.select({ metric: goals.metric })
        .from(goals)
        .where(eq(goals.userId, targetUserId));
      const targetMetrics = new Set(targetGoals.map(g => g.metric));

      const sourceGoals = await tx.select()
        .from(goals)
        .where(eq(goals.userId, sourceUserId));

      for (const goal of sourceGoals) {
        if (targetMetrics.has(goal.metric)) {
          await tx.delete(goals).where(eq(goals.id, goal.id));
        } else {
          await tx.update(goals)
            .set({ userId: targetUserId })
            .where(eq(goals.id, goal.id));
          summary.goalsTransferred++;
        }
      }

      // 4. Transfer achievements (skip duplicates)
      const targetAchievementsList = await tx.select({ achievementId: userAchievements.achievementId })
        .from(userAchievements)
        .where(and(
          eq(userAchievements.userId, targetUserId),
          eq(userAchievements.organizationId, orgId)
        ));
      const targetAchievementIds = new Set(targetAchievementsList.map(a => a.achievementId));

      const sourceAchievementsList = await tx.select()
        .from(userAchievements)
        .where(and(
          eq(userAchievements.userId, sourceUserId),
          eq(userAchievements.organizationId, orgId)
        ));

      for (const achievement of sourceAchievementsList) {
        if (targetAchievementIds.has(achievement.achievementId)) {
          await tx.delete(userAchievements).where(eq(userAchievements.id, achievement.id));
        } else {
          await tx.update(userAchievements)
            .set({ userId: targetUserId })
            .where(eq(userAchievements.id, achievement.id));
          summary.achievementsTransferred++;
        }
      }

      // 5. Transfer wellness responses (historical records)
      const wellnessResult = await tx.update(wellnessResponses)
        .set({ userId: targetUserId })
        .where(eq(wellnessResponses.userId, sourceUserId))
        .returning({ id: wellnessResponses.id });
      summary.wellnessResponsesTransferred = wellnessResult.length;

      // 6. Transfer event registrations (handle duplicates)
      const targetRegistrations = await tx.select({ eventId: eventRegistrations.eventId })
        .from(eventRegistrations)
        .where(eq(eventRegistrations.userId, targetUserId));
      const targetEventIds = new Set(targetRegistrations.map(r => r.eventId));

      const sourceRegistrations = await tx.select()
        .from(eventRegistrations)
        .where(eq(eventRegistrations.userId, sourceUserId));

      for (const reg of sourceRegistrations) {
        if (targetEventIds.has(reg.eventId)) {
          await tx.delete(eventRegistrations).where(eq(eventRegistrations.id, reg.id));
        } else {
          await tx.update(eventRegistrations)
            .set({ userId: targetUserId })
            .where(eq(eventRegistrations.id, reg.id));
          summary.eventRegistrationsTransferred++;
        }
      }

      // Transfer event invitations
      await tx.update(eventInvitations)
        .set({ userId: targetUserId })
        .where(eq(eventInvitations.userId, sourceUserId));

      // 7. Merge user emails (add source emails to target if not duplicate)
      const sourceEmails = sourceUser.emails || [];
      const targetEmails = new Set((targetUser.emails || []).map(e => e.toLowerCase()));
      const newEmails: string[] = [];
      for (const email of sourceEmails) {
        if (!targetEmails.has(email.toLowerCase())) {
          newEmails.push(email);
        }
      }
      if (newEmails.length > 0) {
        const mergedEmails = [...(targetUser.emails || []), ...newEmails];
        await tx.update(users)
          .set({ emails: mergedEmails })
          .where(eq(users.id, targetUserId));
      }
      summary.emailsMerged = newEmails.length;

      // 8. Transfer report shares (handle duplicates)
      const targetShares = await tx.select({ reportId: reportShares.reportId })
        .from(reportShares)
        .where(eq(reportShares.athleteId, targetUserId));
      const targetReportIds = new Set(targetShares.map(s => s.reportId));

      const sourceShares = await tx.select()
        .from(reportShares)
        .where(eq(reportShares.athleteId, sourceUserId));

      for (const share of sourceShares) {
        if (targetReportIds.has(share.reportId)) {
          await tx.delete(reportShares).where(eq(reportShares.id, share.id));
        } else {
          await tx.update(reportShares)
            .set({ athleteId: targetUserId })
            .where(eq(reportShares.id, share.id));
        }
      }

      // 9. Transfer/merge athlete profile
      const [sourceProfile] = await tx.select()
        .from(athleteProfiles)
        .where(eq(athleteProfiles.userId, sourceUserId));
      const [targetProfile] = await tx.select()
        .from(athleteProfiles)
        .where(eq(athleteProfiles.userId, targetUserId));

      if (sourceProfile) {
        if (targetProfile) {
          // Merge notes
          const mergedCoachNotes = [targetProfile.coachNotes, sourceProfile.coachNotes]
            .filter(Boolean)
            .join("\n\n---\n\n");
          const mergedMedicalNotes = [targetProfile.medicalNotes, sourceProfile.medicalNotes]
            .filter(Boolean)
            .join("\n\n---\n\n");

          await tx.update(athleteProfiles)
            .set({
              coachNotes: mergedCoachNotes || null,
              medicalNotes: mergedMedicalNotes || null,
              emergencyContact: targetProfile.emergencyContact || sourceProfile.emergencyContact,
            })
            .where(eq(athleteProfiles.id, targetProfile.id));

          await tx.delete(athleteProfiles).where(eq(athleteProfiles.id, sourceProfile.id));
        } else {
          await tx.update(athleteProfiles)
            .set({ userId: targetUserId })
            .where(eq(athleteProfiles.id, sourceProfile.id));
        }
      }

      // 10. Consolidate Global Athlete links
      const [sourceLink] = await tx.select()
        .from(userGlobalAthleteLinks)
        .where(eq(userGlobalAthleteLinks.userId, sourceUserId));
      const [targetLink] = await tx.select()
        .from(userGlobalAthleteLinks)
        .where(eq(userGlobalAthleteLinks.userId, targetUserId));

      if (sourceLink) {
        if (targetLink) {
          // Both have links - delete source
          await tx.delete(userGlobalAthleteLinks).where(eq(userGlobalAthleteLinks.id, sourceLink.id));
        } else {
          // Transfer link to target
          await tx.update(userGlobalAthleteLinks)
            .set({ userId: targetUserId })
            .where(eq(userGlobalAthleteLinks.id, sourceLink.id));
        }
      }

      // 11. Transfer push subscriptions
      await tx.update(pushSubscriptions)
        .set({ userId: targetUserId })
        .where(eq(pushSubscriptions.userId, sourceUserId));

      // 12. Transfer user organization memberships
      // Delete source's membership in this org (target already has one)
      await tx.delete(userOrganizations)
        .where(and(
          eq(userOrganizations.userId, sourceUserId),
          eq(userOrganizations.organizationId, orgId)
        ));

      // Transfer any other org memberships
      const otherOrgMemberships = await tx.select()
        .from(userOrganizations)
        .where(eq(userOrganizations.userId, sourceUserId));

      // Batch query for target's org memberships
      const otherOrgIds = otherOrgMemberships.map(m => m.organizationId);
      const targetOrgMemberships = otherOrgIds.length > 0
        ? await tx.select()
            .from(userOrganizations)
            .where(and(
              eq(userOrganizations.userId, targetUserId),
              inArray(userOrganizations.organizationId, otherOrgIds)
            ))
        : [];
      const targetOrgIds = new Set(targetOrgMemberships.map(m => m.organizationId));

      for (const membership of otherOrgMemberships) {
        if (targetOrgIds.has(membership.organizationId)) {
          await tx.delete(userOrganizations).where(eq(userOrganizations.id, membership.id));
        } else {
          await tx.update(userOrganizations)
            .set({ userId: targetUserId })
            .where(eq(userOrganizations.id, membership.id));
        }
      }

      // 13. Update invitation references pointing to source
      await tx.update(invitations)
        .set({ playerId: targetUserId })
        .where(eq(invitations.playerId, sourceUserId));

      // 14. Transfer membership requests (handle duplicates)
      const targetRequests = await tx.select({ organizationId: membershipRequests.organizationId })
        .from(membershipRequests)
        .where(and(
          eq(membershipRequests.userId, targetUserId),
          eq(membershipRequests.status, "pending")
        ));
      const targetRequestOrgIds = new Set(targetRequests.map(r => r.organizationId));

      const sourceRequests = await tx.select()
        .from(membershipRequests)
        .where(eq(membershipRequests.userId, sourceUserId));

      for (const request of sourceRequests) {
        if (targetRequestOrgIds.has(request.organizationId) && request.status === "pending") {
          await tx.delete(membershipRequests).where(eq(membershipRequests.id, request.id));
        } else {
          await tx.update(membershipRequests)
            .set({ userId: targetUserId })
            .where(eq(membershipRequests.id, request.id));
        }
      }

      // 15. Delete notification preferences for source (keep target's)
      await tx.delete(notificationPreferences)
        .where(eq(notificationPreferences.userId, sourceUserId));

      // 16. Invalidate source user sessions
      const sessionsBefore = await tx.select({ sid: sessions.sid })
        .from(sessions)
        .where(eq(sessions.userId, sourceUserId));
      summary.sessionsInvalidated = sessionsBefore.length;

      if (sessionsBefore.length > 0) {
        await tx.delete(sessions)
          .where(eq(sessions.userId, sourceUserId));
      }

      // 17. Delete email verification and account linking tokens
      await tx.delete(emailVerificationTokens)
        .where(eq(emailVerificationTokens.userId, sourceUserId));
      await tx.delete(accountLinkingTokens)
        .where(eq(accountLinkingTokens.userId, sourceUserId));

      // 18. Soft-delete the source user
      await tx.update(users)
        .set({
          deletedAt: new Date(),
          isActive: false,
          // Clear OAuth IDs to allow re-linking to target if needed
          googleId: null,
          appleId: null,
        })
        .where(eq(users.id, sourceUserId));

      // 19. Create audit log inside transaction to ensure atomicity
      const auditLogResult = await tx.insert(auditLogs).values({
        userId: actorId,
        action: "profile_merge",
        resourceType: "user",
        resourceId: targetUserId,
        details: JSON.stringify({
          mergeId,
          sourceUserId,
          targetUserId,
          organizationId: orgId,
          summary,
          sourceUserFullName: sourceUser.fullName,
          targetUserFullName: targetUser.fullName,
        }),
        ipAddress: context?.ipAddress ?? null,
        userAgent: context?.userAgent ?? null,
      }).returning({ id: auditLogs.id });

      return {
        summary,
        auditLogId: auditLogResult[0]?.id ?? mergeId,
      };
    }, {
      isolationLevel: "serializable",
    });

    return {
      success: true,
      mergeId,
      summary: result.summary,
      auditLogId: result.auditLogId,
      targetUserId,
      sourceUserSoftDeleted: true,
    };
  }

  /**
   * Validate the actor has org admin permissions for the organization
   */
  private async validateMergeAuthorization(orgId: string, actorId: string): Promise<void> {
    // Check if site admin
    const isSiteAdmin = await this.isSiteAdmin(actorId);
    if (isSiteAdmin) {
      return; // Site admins can merge in any org
    }

    // Check if org admin
    const userOrgs = await this.storage.getUserOrganizations(actorId);
    const orgMembership = userOrgs.find(uo => uo.organizationId === orgId);

    if (!orgMembership || orgMembership.role !== "org_admin") {
      throw new Error("Unauthorized: Only organization administrators can merge profiles");
    }
  }

  /**
   * Validate both users are athletes in the organization (not coaches/admins)
   */
  private async validateUsersAreOrgAthletes(
    orgId: string,
    sourceUserId: string,
    targetUserId: string
  ): Promise<void> {
    const [sourceOrgs, targetOrgs] = await Promise.all([
      this.storage.getUserOrganizations(sourceUserId),
      this.storage.getUserOrganizations(targetUserId),
    ]);

    const sourceOrgMembership = sourceOrgs.find(uo => uo.organizationId === orgId);
    const targetOrgMembership = targetOrgs.find(uo => uo.organizationId === orgId);

    if (!sourceOrgMembership) {
      throw new Error("Source user is not a member of this organization");
    }
    if (!targetOrgMembership) {
      throw new Error("Target user is not a member of this organization");
    }

    // Only allow merging athletes, not coaches or admins
    if (sourceOrgMembership.role !== "athlete") {
      throw new Error("Can only merge athlete profiles, not coaches or administrators");
    }
    if (targetOrgMembership.role !== "athlete") {
      throw new Error("Target profile must be an athlete, not a coach or administrator");
    }
  }

  /**
   * Gather profile data counts for preview
   */
  private async gatherProfileData(userId: string, orgId: string): Promise<{
    measurementCount: number;
    teamMembershipCount: number;
    goalCount: number;
    achievementCount: number;
    wellnessResponseCount: number;
    eventRegistrationCount: number;
    hasGlobalAthleteLink: boolean;
    globalAthleteId?: string;
  }> {
    const [
      measurementCountResult,
      teamMembershipCountResult,
      goalCountResult,
      achievementCountResult,
      wellnessResponseCountResult,
      eventRegistrationCountResult,
      globalAthleteLinkResult,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` })
        .from(measurements)
        .where(and(
          eq(measurements.userId, userId),
          eq(measurements.organizationId, orgId)
        )),

      db.select({ count: sql<number>`count(*)::int` })
        .from(userTeams)
        .where(eq(userTeams.userId, userId)),

      db.select({ count: sql<number>`count(*)::int` })
        .from(goals)
        .where(eq(goals.userId, userId)),

      db.select({ count: sql<number>`count(*)::int` })
        .from(userAchievements)
        .where(and(
          eq(userAchievements.userId, userId),
          eq(userAchievements.organizationId, orgId)
        )),

      db.select({ count: sql<number>`count(*)::int` })
        .from(wellnessResponses)
        .where(eq(wellnessResponses.userId, userId)),

      db.select({ count: sql<number>`count(*)::int` })
        .from(eventRegistrations)
        .where(eq(eventRegistrations.userId, userId)),

      db.select()
        .from(userGlobalAthleteLinks)
        .where(eq(userGlobalAthleteLinks.userId, userId)),
    ]);

    const globalAthleteLink = globalAthleteLinkResult[0];

    return {
      measurementCount: measurementCountResult[0]?.count ?? 0,
      teamMembershipCount: teamMembershipCountResult[0]?.count ?? 0,
      goalCount: goalCountResult[0]?.count ?? 0,
      achievementCount: achievementCountResult[0]?.count ?? 0,
      wellnessResponseCount: wellnessResponseCountResult[0]?.count ?? 0,
      eventRegistrationCount: eventRegistrationCountResult[0]?.count ?? 0,
      hasGlobalAthleteLink: !!globalAthleteLink,
      globalAthleteId: globalAthleteLink?.globalAthleteId,
    };
  }

  /**
   * Detect conflicts between source and target profiles
   */
  private async detectConflicts(
    sourceUserId: string,
    targetUserId: string,
    orgId: string,
    sourceUser: User,
    targetUser: User
  ): Promise<MergeConflict[]> {
    const conflicts: MergeConflict[] = [];

    // Check for Global Athlete conflicts (blocking if different GAs)
    const [sourceLinkResult, targetLinkResult] = await Promise.all([
      db.select().from(userGlobalAthleteLinks)
        .where(eq(userGlobalAthleteLinks.userId, sourceUserId)),
      db.select().from(userGlobalAthleteLinks)
        .where(eq(userGlobalAthleteLinks.userId, targetUserId)),
    ]);

    const sourceLink = sourceLinkResult[0];
    const targetLink = targetLinkResult[0];

    if (sourceLink && targetLink &&
        sourceLink.globalAthleteId !== targetLink.globalAthleteId) {
      conflicts.push({
        type: "global_athlete_different",
        description: "Both profiles are linked to different Global Athletes. Resolve Global Athlete records before merging.",
        sourceData: { globalAthleteId: sourceLink.globalAthleteId },
        targetData: { globalAthleteId: targetLink.globalAthleteId },
        resolution: "blocked",
      });
    }

    // Check for OAuth conflicts (blocking if same provider with different IDs)
    // Google OAuth conflict
    if (sourceUser.googleId && targetUser.googleId &&
        sourceUser.googleId !== targetUser.googleId) {
      conflicts.push({
        type: "oauth_same_provider",
        description: "Both profiles have different Google accounts linked. This may indicate different people.",
        sourceData: { googleId: sourceUser.googleId },
        targetData: { googleId: targetUser.googleId },
        resolution: "blocked",
      });
    }

    // Apple OAuth conflict
    if (sourceUser.appleId && targetUser.appleId &&
        sourceUser.appleId !== targetUser.appleId) {
      conflicts.push({
        type: "oauth_same_provider",
        description: "Both profiles have different Apple accounts linked. This may indicate different people.",
        sourceData: { appleId: sourceUser.appleId },
        targetData: { appleId: targetUser.appleId },
        resolution: "blocked",
      });
    }

    // Check for measurement conflicts (same metric on same date) - informational
    // Get source measurements
    const sourceMeasurements = await db.select({
      metric: measurements.metric,
      date: measurements.date,
    })
      .from(measurements)
      .where(and(
        eq(measurements.userId, sourceUserId),
        eq(measurements.organizationId, orgId)
      ));

    // Get target measurements
    const targetMeasurements = await db.select({
      metric: measurements.metric,
      date: measurements.date,
    })
      .from(measurements)
      .where(and(
        eq(measurements.userId, targetUserId),
        eq(measurements.organizationId, orgId)
      ));

    // Find conflicts by comparing in-memory
    const targetMeasurementSet = new Set(
      targetMeasurements.map(m => `${m.metric}:${m.date}`)
    );
    const measurementConflicts = sourceMeasurements.filter(sm =>
      targetMeasurementSet.has(`${sm.metric}:${sm.date}`)
    );

    if (measurementConflicts.length > 0) {
      conflicts.push({
        type: "measurement_same_date",
        description: `${measurementConflicts.length} measurement(s) exist on the same date for the same metric. Both will be kept by default.`,
        sourceData: { count: measurementConflicts.length },
        resolution: "keep_both",
      });
    }

    return conflicts;
  }

  /**
   * Get OAuth providers for a user
   */
  private getOAuthProviders(user: User): string[] {
    const providers: string[] = [];
    if (user.googleId) providers.push("google");
    if (user.appleId) providers.push("apple");
    return providers;
  }
}

// Export singleton instance
export const profileMergeService = new ProfileMergeService();
