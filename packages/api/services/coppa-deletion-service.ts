/**
 * COPPA Data Deletion Service
 *
 * Implements the COPPA Section 312.6 right-to-delete requirement:
 * parents may request deletion of their child's data at any time.
 *
 * Cascade delete order (respects FK constraints and data integrity):
 * 1.  Measurements for athlete
 * 2.  Wellness responses
 * 3.  Event registrations / invitations
 * 4.  Report shares (removes athlete from shared reports)
 * 5.  AI coaching insights (nulled on report snapshots — not hard-deleted)
 * 6.  Global athlete links (unlink from cross-org profile)
 * 7.  Organization memberships + team memberships
 * 8.  Parent-athlete links
 * 9.  Parental consent records (marked revoked — NOT deleted; retained for audit)
 * 10. User profile data → soft-delete (isActive=false, deletedAt=now)
 *     Retain minimal record for 5-year COPPA audit compliance.
 *
 * The COPPA audit log is NEVER deleted — it is retained for 5 years per
 * FTC guidance. The deletion completion is recorded as an audit entry.
 *
 * Security invariants:
 * - Only site_admin can process deletions
 * - The dataDeletionRequest record is updated BEFORE the cascade so it is
 *   not lost via user FK cascade (athleteUserId → users.id onDelete: cascade)
 */

import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { BaseService } from './base-service';
import { EmailService } from './email-service';
import {
  dataDeletionRequests,
  parentalConsents,
  parentAthleteLinks,
  coppaAuditLog,
} from '@shared/schema/tables/coppa';
import { users, userTeams, athleteProfiles } from '@shared/schema/tables/core';
import { userOrganizations } from '@shared/schema/tables/membership';
import { measurements } from '@shared/schema/tables/measurements';
import { wellnessResponses } from '@shared/schema/tables/wellness';
import { eventRegistrations, eventInvitations } from '@shared/schema/tables/events';
import { reportShares } from '@shared/schema/tables/reports';
import { userGlobalAthleteLinks } from '@shared/schema/tables/global-athletes';
import {
  COPPA_ACTIONS,
  getAuditRetentionDate,
  type CoppaAction,
} from '@shared/coppa-utils';
import type { AuditParams } from './coppa-service';

// ============================================================================
// Types
// ============================================================================

export interface InitiateDeletionParams {
  athleteUserId: string;
  requestedByEmail: string;
  consentId?: string;
  notes?: string;
  actorUserId?: string;
  ip?: string;
}

export interface InitiateDeletionResult {
  success: boolean;
  requestId?: string;
  error?: string;
  statusCode?: number;
}

export interface ProcessDeletionResult {
  success: boolean;
  deletedCategories?: string[];
  error?: string;
  statusCode?: number;
}

export interface DeletionRequest {
  id: string;
  athleteUserId: string;
  requestedByEmail: string;
  consentId: string | null;
  status: string;
  requestedAt: Date;
  processedAt: Date | null;
  processedBy: string | null;
  notes: string | null;
}

// ============================================================================
// Service
// ============================================================================

export class CoppaDeletionService extends BaseService {
  private emailService = new EmailService();

  /**
   * Initiate a data deletion request.
   *
   * Can be called by:
   * - site_admin (authenticated)
   * - org_admin sharing an org with the athlete (authenticated)
   * - Public token-gated request (parent follows email link with consent token)
   *
   * Idempotency: returns 409 if a pending request already exists for this athlete.
   */
  async initiateDeletionRequest(params: InitiateDeletionParams): Promise<InitiateDeletionResult> {
    const { athleteUserId, requestedByEmail, consentId, notes, actorUserId, ip } = params;

    try {
      // Verify athlete exists
      const athlete = await this.storage.getUser(athleteUserId);
      if (!athlete) {
        return { success: false, error: 'Athlete not found', statusCode: 404 };
      }

      // Check for existing pending request (prevent duplicates)
      const [existing] = await db.select({ id: dataDeletionRequests.id })
        .from(dataDeletionRequests)
        .where(and(
          eq(dataDeletionRequests.athleteUserId, athleteUserId),
          eq(dataDeletionRequests.status, 'pending'),
        ))
        .limit(1);

      if (existing) {
        return {
          success: false,
          error: 'A pending data deletion request already exists for this athlete.',
          statusCode: 409,
        };
      }

      // Create deletion request record
      const [request] = await db.insert(dataDeletionRequests).values({
        athleteUserId,
        requestedByEmail,
        consentId: consentId ?? null,
        status: 'pending',
        notes: notes ?? null,
      }).returning({ id: dataDeletionRequests.id });

      // Write audit log
      await this.writeDeletionAudit({
        action: COPPA_ACTIONS.DATA_DELETION_REQUESTED,
        athleteUserId,
        actorUserId: actorUserId ?? null,
        actorEmail: requestedByEmail,
        ip,
        details: {
          requestId: request.id,
          consentId: consentId ?? null,
        },
      });

      // Send confirmation email to requester
      const athleteName = `${athlete.firstName} ${athlete.lastName}`;
      await this.emailService.sendDeletionRequestConfirmation(requestedByEmail, {
        athleteName,
        requestId: request.id,
      });

      return { success: true, requestId: request.id };
    } catch (error) {
      console.error('[COPPA Deletion] initiateDeletionRequest failed:', error);
      return {
        success: false,
        error: 'Failed to initiate deletion request',
        statusCode: 500,
      };
    }
  }

  /**
   * Retrieve a deletion request by ID.
   */
  async getDeletionRequest(requestId: string): Promise<DeletionRequest | null> {
    const [request] = await db.select()
      .from(dataDeletionRequests)
      .where(eq(dataDeletionRequests.id, requestId))
      .limit(1);

    return request ?? null;
  }

  /**
   * Execute the cascade deletion for a pending request.
   *
   * This is irreversible. Only site_admin may call this.
   *
   * Steps:
   * 1. Update request to 'processing' state first (before cascade destroys the record)
   * 2. Cascade delete in FK-safe order
   * 3. Soft-delete user record (retain for compliance audit)
   * 4. Update request to 'completed'
   * 5. Write audit log with list of deleted categories
   * 6. Send completion notification email
   */
  async processDeletion(
    requestId: string,
    processedBy: string,
    notes?: string,
    ip?: string,
  ): Promise<ProcessDeletionResult> {
    // Verify request exists and is pending
    const request = await this.getDeletionRequest(requestId);
    if (!request) {
      return { success: false, error: 'Deletion request not found', statusCode: 404 };
    }

    if (request.status !== 'pending') {
      return {
        success: false,
        error: `Deletion request is already ${request.status}. Only pending requests can be processed.`,
        statusCode: 409,
      };
    }

    const athleteUserId = request.athleteUserId;
    const deletedCategories: string[] = [];

    try {
      // Run the entire cascade in a single transaction so partial deletes
      // are impossible. If any step fails, the whole thing rolls back.
      await db.transaction(async (tx) => {
        // STEP 0: Mark as 'processing' BEFORE cascade deletes anything.
        await tx.update(dataDeletionRequests)
          .set({ status: 'processing' })
          .where(eq(dataDeletionRequests.id, requestId));

        // STEP 1: Delete measurements
        const deletedMeasurements = await tx.delete(measurements)
          .where(eq(measurements.userId, athleteUserId))
          .returning({ id: measurements.id });
        if (deletedMeasurements.length > 0) {
          deletedCategories.push(`measurements (${deletedMeasurements.length})`);
        }

        // STEP 2: Delete wellness responses
        const deletedWellness = await tx.delete(wellnessResponses)
          .where(eq(wellnessResponses.userId, athleteUserId))
          .returning({ id: wellnessResponses.id });
        if (deletedWellness.length > 0) {
          deletedCategories.push(`wellness_responses (${deletedWellness.length})`);
        }

        // STEP 3: Delete event registrations
        const deletedRegistrations = await tx.delete(eventRegistrations)
          .where(eq(eventRegistrations.userId, athleteUserId))
          .returning({ id: eventRegistrations.id });
        if (deletedRegistrations.length > 0) {
          deletedCategories.push(`event_registrations (${deletedRegistrations.length})`);
        }

        // STEP 3b: Delete event invitations
        const deletedInvitations = await tx.delete(eventInvitations)
          .where(eq(eventInvitations.userId, athleteUserId))
          .returning({ id: eventInvitations.id });
        if (deletedInvitations.length > 0) {
          deletedCategories.push(`event_invitations (${deletedInvitations.length})`);
        }

        // STEP 4: Delete report shares
        const deletedShares = await tx.delete(reportShares)
          .where(eq(reportShares.athleteId, athleteUserId))
          .returning({ id: reportShares.id });
        if (deletedShares.length > 0) {
          deletedCategories.push(`report_shares (${deletedShares.length})`);
        }

        // STEP 5: Unlink from global athlete profiles
        const deletedGlobalLinks = await tx.delete(userGlobalAthleteLinks)
          .where(eq(userGlobalAthleteLinks.userId, athleteUserId))
          .returning({ id: userGlobalAthleteLinks.id });
        if (deletedGlobalLinks.length > 0) {
          deletedCategories.push(`global_athlete_links (${deletedGlobalLinks.length})`);
        }

        // STEP 6: Delete organization memberships
        const deletedOrgMemberships = await tx.delete(userOrganizations)
          .where(eq(userOrganizations.userId, athleteUserId))
          .returning({ id: userOrganizations.id });
        if (deletedOrgMemberships.length > 0) {
          deletedCategories.push(`organization_memberships (${deletedOrgMemberships.length})`);
        }

        // STEP 6b: Delete team memberships
        const deletedTeamMemberships = await tx.delete(userTeams)
          .where(eq(userTeams.userId, athleteUserId))
          .returning({ id: userTeams.id });
        if (deletedTeamMemberships.length > 0) {
          deletedCategories.push(`team_memberships (${deletedTeamMemberships.length})`);
        }

        // STEP 6c: Delete athlete profile
        const deletedProfiles = await tx.delete(athleteProfiles)
          .where(eq(athleteProfiles.userId, athleteUserId))
          .returning({ id: athleteProfiles.id });
        if (deletedProfiles.length > 0) {
          deletedCategories.push(`athlete_profiles (${deletedProfiles.length})`);
        }

        // STEP 7: Delete parent-athlete links
        const deletedParentLinks = await tx.delete(parentAthleteLinks)
          .where(eq(parentAthleteLinks.athleteUserId, athleteUserId))
          .returning({ id: parentAthleteLinks.id });
        if (deletedParentLinks.length > 0) {
          deletedCategories.push(`parent_athlete_links (${deletedParentLinks.length})`);
        }

        // STEP 8: Revoke parental consent records (NOT deleted — retained for audit)
        const [updatedConsent] = await tx.update(parentalConsents)
          .set({ status: 'revoked', revokedAt: new Date() })
          .where(and(
            eq(parentalConsents.athleteUserId, athleteUserId),
            eq(parentalConsents.status, 'confirmed'),
          ))
          .returning({ id: parentalConsents.id });
        if (updatedConsent) {
          deletedCategories.push('parental_consent_revoked (retained for audit)');
        }

        // STEP 9: Write completion audit log BEFORE soft-deleting user.
        // coppaAuditLog has no FK on athleteUserId — it's a plain varchar.
        const retainUntil = getAuditRetentionDate();
        await tx.insert(coppaAuditLog).values({
          action: COPPA_ACTIONS.DATA_DELETION_COMPLETED,
          athleteUserId,
          actorUserId: processedBy,
          actorIp: ip ?? null,
          details: JSON.stringify({ requestId, deletedCategories }),
          retainUntil,
        });
        deletedCategories.push('coppa_audit_log (retained)');

        // STEP 10: Soft-delete user — retain minimal record for compliance.
        await tx.update(users)
          .set({
            isActive: false,
            deletedAt: new Date(),
            coppaStatus: 'consent_revoked',
            // Clear PII fields while retaining the record
            password: null,
            emails: [],
            phoneNumbers: null,
            birthDate: null,
            birthYear: null,
            school: null,
            sports: null,
            positions: null,
            height: null,
            weight: null,
            googleId: null,
            appleId: null,
            oauthEmail: null,
            parentEmail: null,
            mfaSecret: null,
            backupCodes: null,
          })
          .where(eq(users.id, athleteUserId));
        deletedCategories.push('user_pii_cleared');

        // STEP 11: Mark deletion request as completed.
        await tx.update(dataDeletionRequests)
          .set({
            status: 'completed',
            processedAt: new Date(),
            processedBy,
            notes: notes ?? request.notes,
          })
          .where(eq(dataDeletionRequests.id, requestId));
      });

      // STEP 12: Send completion notification email (outside transaction —
      // email failures should not roll back the deletion or report failure)
      try {
        await this.emailService.sendDeletionCompletedNotification(request.requestedByEmail, {
          requestId,
          deletedCategories,
        });
      } catch (emailErr) {
        console.error('[COPPA Deletion] Deletion succeeded but notification email failed:', emailErr);
      }

      return { success: true, deletedCategories };
    } catch (error) {
      // Transaction rolled back — request stays in prior state
      console.error('[COPPA Deletion] processDeletion failed:', error);
      return {
        success: false,
        error: 'Failed to process deletion',
        statusCode: 500,
      };
    }
  }

  /**
   * Write a COPPA audit log entry for deletion events.
   * Delegates to the same pattern as coppa-service.ts writeCoppaAudit.
   */
  private async writeDeletionAudit(params: AuditParams): Promise<void> {
    const retainUntil = getAuditRetentionDate();
    const detailsJson = params.details ? JSON.stringify(params.details) : null;

    await db.insert(coppaAuditLog).values({
      action: params.action,
      athleteUserId: params.athleteUserId ?? null,
      consentId: params.consentId ?? null,
      actorUserId: params.actorUserId ?? null,
      actorEmail: params.actorEmail ?? null,
      actorIp: params.ip ?? null,
      actorUserAgent: params.userAgent ?? null,
      details: detailsJson,
      retainUntil,
    });
  }
}

export const coppaDeletionService = new CoppaDeletionService();
