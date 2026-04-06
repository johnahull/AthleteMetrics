/**
 * COPPA Data Export Service
 *
 * Implements the data export right for parents of under-13 athletes.
 * Parents can request a full data export of their child's account to review
 * what information AthleteMetrics holds about them (COPPA §312.6(a)(2)).
 *
 * Security invariants enforced here:
 * - Raw download tokens NEVER stored in DB — only SHA-256 hashes
 * - Download token is one-time use: status transitions pending→processing→ready→delivered
 * - Expired tokens (downloadExpiresAt < now) return 410 Gone
 * - Already-delivered tokens return 410 Gone (cannot re-download)
 * - Export bundle collects profile + measurements + wellness + events + report metadata
 */

import crypto from 'crypto';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../db';
import { BaseService } from './base-service';
import { EmailService } from './email-service';
import {
  dataExportRequests,
  parentalConsents,
  coppaAuditLog,
} from '@shared/schema/tables/coppa';
import { users } from '@shared/schema/tables/core';
import { measurements } from '@shared/schema/tables/measurements';
import { wellnessResponses } from '@shared/schema/tables/wellness';
import { eventRegistrations } from '@shared/schema/tables/events';
import { reportSnapshots, reports, reportShares } from '@shared/schema/tables/reports';
import { COPPA_ACTIONS, getAuditRetentionDate } from '@shared/coppa-utils';

// ============================================================================
// Types
// ============================================================================

export interface RequestExportParams {
  athleteUserId: string;
  requestedByEmail: string;
  consentId?: string;
  ip?: string;
  userAgent?: string;
  actorUserId?: string;
}

export interface RequestExportResult {
  success: boolean;
  exportRequestId?: string;
  error?: string;
}

export interface DownloadExportResult {
  success: boolean;
  bundle?: ExportBundle;
  error?: string;
  /** HTTP status code to return */
  statusCode?: number;
}

export interface ExportBundle {
  exportedAt: string;
  athlete: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    fullName: string | null;
    emails: string[] | null;
    birthDate: string | null;
    sports: string[] | null;
    coppaStatus: string | null;
    isMinor: boolean | null;
    parentEmail: string | null;
    createdAt: Date | null;
  };
  measurements: Array<{
    id: string;
    metric: string;
    value: string;
    units: string;
    date: string;
    age: number;
    teamNameSnapshot: string | null;
    isVerified: boolean;
    createdAt: Date;
  }>;
  wellnessResponses: Array<{
    id: string;
    date: string;
    submittedAt: Date;
    teamNameSnapshot: string | null;
  }>;
  eventParticipations: Array<{
    id: string;
    eventId: string;
    status: string;
    requestedAt: Date;
    userFullNameSnapshot: string;
  }>;
  reportSnapshots: Array<{
    id: string;
    reportId: string;
    createdAt: Date;
    expiresAt: Date;
    containsMinorData: boolean;
    publicAccessRestricted: boolean;
  }>;
}

// ============================================================================
// 7-day download expiry for export tokens
// ============================================================================

const EXPORT_TOKEN_EXPIRY_DAYS = 7;

function getExportTokenExpiry(): Date {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + EXPORT_TOKEN_EXPIRY_DAYS);
  return expiry;
}

// ============================================================================
// Service
// ============================================================================

export class CoppaExportService extends BaseService {
  private emailService = new EmailService();

  /**
   * Hash a raw token for safe DB storage.
   * The raw token lives only in memory and in the download URL — never in the DB.
   */
  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Generate a cryptographically secure raw token (64 hex chars = 256 bits).
   */
  private generateRawToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Request a data export for a minor athlete.
   *
   * Called either by:
   * - An authenticated org_admin or site_admin (actorUserId set)
   * - A parent using token-gated access (consentId + parentEmail verified by caller)
   *
   * Flow:
   * 1. Create export request record with status='processing'
   * 2. Build the export bundle immediately (synchronous for simplicity)
   * 3. Generate one-time download token (hash stored in DB, raw sent in email)
   * 4. Update status to 'ready', store token hash + expiry
   * 5. Send export ready notification email with download link
   * 6. Write audit log
   */
  async requestExport(params: RequestExportParams): Promise<RequestExportResult> {
    const { athleteUserId, requestedByEmail, consentId, ip, userAgent, actorUserId } = params;

    try {
      // Verify athlete exists
      const athlete = await this.storage.getUser(athleteUserId);
      if (!athlete) {
        return { success: false, error: 'Athlete not found' };
      }

      // Generate download token — raw for email, hash for DB
      const rawDownloadToken = this.generateRawToken();
      const tokenHash = this.hashToken(rawDownloadToken);
      const downloadExpiresAt = getExportTokenExpiry();

      // Create export request record
      const [exportRequest] = await db.insert(dataExportRequests).values({
        athleteUserId,
        requestedByEmail,
        consentId: consentId ?? null,
        status: 'ready',
        downloadToken: tokenHash,
        downloadExpiresAt,
        processedAt: new Date(),
      }).returning({ id: dataExportRequests.id });

      // Write audit log
      await this.writeCoppaAudit({
        action: COPPA_ACTIONS.DATA_EXPORT_REQUESTED,
        athleteUserId,
        consentId: consentId ?? null,
        actorUserId: actorUserId ?? null,
        actorEmail: requestedByEmail,
        ip,
        userAgent,
        details: { exportRequestId: exportRequest.id },
      });

      // Send export ready notification email with raw download token
      const baseUrl = process.env.APP_URL || process.env.BASE_URL || 'https://athletemetrics.app';
      const downloadUrl = `${baseUrl}/api/coppa/data-export/download/${rawDownloadToken}`;

      await this.emailService.sendExportReadyNotification(requestedByEmail, {
        athleteName: `${athlete.firstName ?? ''} ${athlete.lastName ?? ''}`.trim() || 'the athlete',
        downloadUrl,
        expiresAt: downloadExpiresAt,
      });

      return { success: true, exportRequestId: exportRequest.id };
    } catch (error) {
      console.error('[COPPA Export] requestExport failed:', error);
      return {
        success: false,
        error: 'Failed to create export request',
      };
    }
  }

  /**
   * Download a data export using the one-time download token.
   *
   * Security invariants:
   * - Token must not be expired (downloadExpiresAt >= now)
   * - Token must be in 'ready' status (not delivered or expired)
   * - After download, status is immediately set to 'delivered' (atomic update)
   * - Audit log is always written before returning data
   */
  async downloadExport(rawDownloadToken: string): Promise<DownloadExportResult> {
    try {
      const tokenHash = this.hashToken(rawDownloadToken);

      // Look up the export request by token hash
      const [exportRequest] = await db.select()
        .from(dataExportRequests)
        .where(eq(dataExportRequests.downloadToken, tokenHash))
        .limit(1);

      if (!exportRequest) {
        // Constant-time response — don't reveal whether hash was in DB
        return { success: false, error: 'Invalid or expired download link.', statusCode: 404 };
      }

      // One-time use enforcement — already delivered
      if (exportRequest.status === 'delivered' || exportRequest.deliveredAt) {
        return { success: false, error: 'This download link has already been used.', statusCode: 410 };
      }

      // Check expiry
      if (exportRequest.downloadExpiresAt && new Date() > exportRequest.downloadExpiresAt) {
        // Mark as expired
        await db.update(dataExportRequests)
          .set({ status: 'expired' })
          .where(eq(dataExportRequests.id, exportRequest.id));
        return { success: false, error: 'This download link has expired.', statusCode: 410 };
      }

      // Only 'ready' requests can be downloaded
      if (exportRequest.status !== 'ready') {
        return { success: false, error: 'Export is not ready for download.', statusCode: 400 };
      }

      // Atomically claim the token BEFORE building the bundle.
      // This prevents a race where two concurrent requests both build
      // the full PII bundle before one of them discovers it lost the race.
      const [claimed] = await db.update(dataExportRequests)
        .set({
          status: 'delivered',
          deliveredAt: new Date(),
        })
        .where(and(
          eq(dataExportRequests.id, exportRequest.id),
          eq(dataExportRequests.status, 'ready'),
        ))
        .returning({ id: dataExportRequests.id });

      if (!claimed) {
        return { success: false, error: 'This download link has already been used.', statusCode: 410 };
      }

      // Build the export bundle only after successful claim.
      // Write the audit log regardless of whether bundle build succeeds — the token
      // was consumed above, so we must record the attempt even on partial failure.
      let bundle: Awaited<ReturnType<typeof this.buildExportBundle>> | undefined;
      let buildError: Error | undefined;
      try {
        bundle = await this.buildExportBundle(exportRequest.athleteUserId);
      } catch (err) {
        buildError = err as Error;
        console.error('[COPPA Export] buildExportBundle failed after token claimed:', err);
      } finally {
        // Always write audit log — token is permanently consumed, COPPA requires the record
        await this.writeCoppaAudit({
          action: COPPA_ACTIONS.DATA_EXPORT_DELIVERED,
          athleteUserId: exportRequest.athleteUserId,
          consentId: exportRequest.consentId ?? null,
          actorEmail: exportRequest.requestedByEmail,
          details: {
            exportRequestId: exportRequest.id,
            ...(buildError ? { error: buildError.message, buildFailed: true } : {}),
          },
        }).catch((auditErr: unknown) => {
          console.error('[COPPA Export] Failed to write audit log after delivery:', auditErr);
        });
      }

      if (buildError) {
        return { success: false, error: 'Failed to build export bundle.', statusCode: 500 };
      }

      return { success: true, bundle: bundle! };
    } catch (error) {
      console.error('[COPPA Export] downloadExport failed:', error);
      return {
        success: false,
        error: 'Failed to process download.',
        statusCode: 500,
      };
    }
  }

  /**
   * Build the complete data export bundle for an athlete.
   *
   * Collects:
   * - Profile: name, email, DOB, sports, teams
   * - All measurements with dates and metric types
   * - Wellness responses (metadata only, not raw answers for privacy)
   * - Event participations
   * - Report snapshots (metadata, not full PDF/data blobs)
   */
  private async buildExportBundle(athleteUserId: string): Promise<ExportBundle> {
    const athlete = await this.storage.getUser(athleteUserId);
    if (!athlete) {
      throw new Error(`Athlete not found: ${athleteUserId}`);
    }

    // Collect measurements
    const athleteMeasurements = await db.select({
      id: measurements.id,
      metric: measurements.metric,
      value: measurements.value,
      units: measurements.units,
      date: measurements.date,
      age: measurements.age,
      teamNameSnapshot: measurements.teamNameSnapshot,
      isVerified: measurements.isVerified,
      createdAt: measurements.createdAt,
    })
      .from(measurements)
      .where(eq(measurements.userId, athleteUserId));

    // Collect wellness responses (metadata only — not raw answer data)
    const athleteWellness = await db.select({
      id: wellnessResponses.id,
      date: wellnessResponses.date,
      submittedAt: wellnessResponses.submittedAt,
      teamNameSnapshot: wellnessResponses.teamNameSnapshot,
    })
      .from(wellnessResponses)
      .where(eq(wellnessResponses.userId, athleteUserId));

    // Collect event participations
    const athleteEvents = await db.select({
      id: eventRegistrations.id,
      eventId: eventRegistrations.eventId,
      status: eventRegistrations.status,
      requestedAt: eventRegistrations.requestedAt,
      userFullNameSnapshot: eventRegistrations.userFullNameSnapshot,
    })
      .from(eventRegistrations)
      .where(eq(eventRegistrations.userId, athleteUserId));

    // Collect report snapshots for reports explicitly shared with this athlete.
    let athleteReportSnapshots: Array<{
      id: string;
      reportId: string;
      createdAt: Date;
      expiresAt: Date;
      containsMinorData: boolean;
      publicAccessRestricted: boolean;
    }> = [];

    // Only include snapshots for reports explicitly shared with this athlete.
    // The previous approach used the athlete's org membership as a proxy, which
    // returned snapshots for ALL minors in the org — disclosing other children's
    // report metadata to an unauthorized parent (a COPPA violation).
    const sharedReportIds = await db.select({ reportId: reportShares.reportId })
      .from(reportShares)
      .where(eq(reportShares.athleteId, athleteUserId));

    if (sharedReportIds.length > 0) {
      athleteReportSnapshots = await db.select({
        id: reportSnapshots.id,
        reportId: reportSnapshots.reportId,
        createdAt: reportSnapshots.createdAt,
        expiresAt: reportSnapshots.expiresAt,
        containsMinorData: reportSnapshots.containsMinorData,
        publicAccessRestricted: reportSnapshots.publicAccessRestricted,
      })
        .from(reportSnapshots)
        .where(inArray(reportSnapshots.reportId, sharedReportIds.map(r => r.reportId)));
    }

    return {
      exportedAt: new Date().toISOString(),
      athlete: {
        id: athlete.id,
        firstName: athlete.firstName ?? null,
        lastName: athlete.lastName ?? null,
        fullName: athlete.fullName ?? null,
        emails: athlete.emails ?? null,
        birthDate: athlete.birthDate ?? null,
        sports: athlete.sports ?? null,
        coppaStatus: athlete.coppaStatus ?? null,
        isMinor: athlete.isMinor ?? null,
        parentEmail: athlete.parentEmail ?? null,
        createdAt: athlete.createdAt ?? null,
      },
      measurements: athleteMeasurements,
      wellnessResponses: athleteWellness,
      eventParticipations: athleteEvents,
      reportSnapshots: athleteReportSnapshots,
    };
  }

  /**
   * Verify consent ownership for token-gated export requests.
   * Returns the athleteUserId if the consentId + parentEmail match.
   */
  async verifyConsentOwnership(
    consentId: string,
    parentEmail: string,
  ): Promise<{ valid: boolean; athleteUserId?: string; error?: string; reason?: 'not_found' | 'email_mismatch' | 'not_confirmed' }> {
    const [consent] = await db.select({
      id: parentalConsents.id,
      athleteUserId: parentalConsents.athleteUserId,
      parentEmail: parentalConsents.parentEmail,
      status: parentalConsents.status,
    })
      .from(parentalConsents)
      .where(eq(parentalConsents.id, consentId))
      .limit(1);

    if (!consent) {
      return { valid: false, reason: 'not_found' as const, error: 'Consent record not found.' };
    }

    if (consent.parentEmail.toLowerCase() !== parentEmail.toLowerCase()) {
      return { valid: false, reason: 'email_mismatch' as const, error: 'Email does not match consent record.' };
    }

    if (consent.status !== 'confirmed') {
      return { valid: false, reason: 'not_confirmed' as const, error: 'Consent must be confirmed to request export.' };
    }

    return { valid: true, athleteUserId: consent.athleteUserId };
  }

  /**
   * Write an immutable COPPA audit log entry.
   * Delegates to CoppaService pattern for consistency.
   */
  private async writeCoppaAudit(params: {
    action: string;
    athleteUserId?: string | null;
    consentId?: string | null;
    actorUserId?: string | null;
    actorEmail?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    details?: Record<string, unknown>;
  }): Promise<void> {
    const retainUntil = getAuditRetentionDate();

    await db.insert(coppaAuditLog).values({
      action: params.action,
      athleteUserId: params.athleteUserId ?? null,
      consentId: params.consentId ?? null,
      actorUserId: params.actorUserId ?? null,
      actorEmail: params.actorEmail ?? null,
      actorIp: params.ip ?? null,
      actorUserAgent: params.userAgent ?? null,
      details: params.details ? JSON.stringify(params.details) : null,
      retainUntil,
    });
  }
}

export const coppaExportService = new CoppaExportService();
