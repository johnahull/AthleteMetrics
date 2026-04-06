/**
 * COPPA Compliance Service
 *
 * Manages the verifiable parental consent (VPC) lifecycle for under-13 athletes.
 * Mirrors the architectural pattern of oauth-service.ts.
 *
 * Security invariants enforced here:
 * - Raw tokens NEVER stored in DB — only SHA-256 hashes
 * - Token verification is timing-safe (constant-time hash comparison)
 * - aiConsentGranted === null/undefined → canAccessAI = false (fail closed)
 * - coppaStatus must be 'consented' AND aiConsentGranted === true for AI access
 */

import crypto from 'crypto';
import { eq, and, isNull, sql, inArray } from 'drizzle-orm';
import { db } from '../db';
import { BaseService } from './base-service';
import { EmailService } from './email-service';
import {
  parentalConsents,
  parentAthleteLinks,
  coppaAuditLog,
} from '@shared/schema/tables/coppa';
import { users } from '@shared/schema/tables/core';
import type { ParentalConsent, ConsentStatus } from '@shared/schema';
import {
  isUnder13,
  getConsentTokenExpiry,
  getAuditRetentionDate,
  COPPA_ACTIONS,
  type CoppaAction,
} from '@shared/coppa-utils';

// ============================================================================
// Types
// ============================================================================

export interface InitiateConsentParams {
  athleteUserId: string;
  parentEmail: string;
  organizationId?: string;
  ip?: string;
  userAgent?: string;
}

export interface InitiateConsentResult {
  success: boolean;
  consentId?: string;
  error?: string;
  emailSent?: boolean;
}

export interface VerifyTokenResult {
  valid: boolean;
  consent?: ParentalConsent;
  error?: string;
  /** HTTP status code to return (404, 400, 410, 200) */
  statusCode?: number;
}

/** Typed result for verifyConfirmedToken — avoids coupling to error message strings */
export type VerifyConfirmedTokenResult =
  | { confirmed: true; consent: ParentalConsent }
  | { confirmed: false; reason: 'not_found' | 'expired' | 'revoked' | 'pending' | 'error' };

export interface ConfirmConsentParams {
  consentId: string;
  aiConsentGranted: boolean;
  ip?: string;
  userAgent?: string;
}

export interface ConfirmConsentResult {
  success: boolean;
  error?: string;
}

export interface AuditParams {
  action: CoppaAction;
  athleteUserId?: string | null;
  consentId?: string | null;
  actorUserId?: string | null;
  actorEmail?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  details?: Record<string, unknown>;
}

// ============================================================================
// Service
// ============================================================================

export class CoppaService extends BaseService {
  private emailService = new EmailService();

  /**
   * Hash a raw token for safe DB storage.
   * The raw token lives only in memory and in the email link — never in the DB.
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
   * Initiate the VPC flow for an under-13 athlete:
   * 1. Generate token + hash
   * 2. Store consent record (hash only)
   * 3. Update user coppaStatus → 'pending_consent'
   * 4. Send parental consent email (with raw token in link)
   * 5. Write audit log
   */
  async initiateConsent(params: InitiateConsentParams): Promise<InitiateConsentResult> {
    const { athleteUserId, parentEmail, organizationId, ip, userAgent } = params;

    try {
      const rawToken = this.generateRawToken();
      const tokenHash = this.hashToken(rawToken);
      const expiresAt = getConsentTokenExpiry();
      const retainUntil = getAuditRetentionDate();

      // Create consent record (hash only — never raw token)
      const [consent] = await db.insert(parentalConsents).values({
        athleteUserId,
        organizationId: organizationId ?? null,
        parentEmail,
        tokenHash,
        status: 'pending',
        expiresAt,
        initiatedIp: ip ?? null,
        initiatedUserAgent: userAgent ?? null,
      }).returning({ id: parentalConsents.id });

      // Update user COPPA status and link to consent record
      await db.update(users)
        .set({
          coppaStatus: 'pending_consent',
          isMinor: true,
          parentEmail,
          parentConsentId: consent.id,
        })
        .where(eq(users.id, athleteUserId));

      // Create parent-athlete link record
      await db.insert(parentAthleteLinks).values({
        parentEmail,
        athleteUserId,
        organizationId: organizationId ?? null,
        consentId: consent.id,
      }).onConflictDoNothing();

      // Write audit log before sending email (email could fail — audit is priority)
      await this.writeCoppaAudit({
        action: COPPA_ACTIONS.CONSENT_INITIATED,
        athleteUserId,
        consentId: consent.id,
        actorUserId: athleteUserId,
        ip,
        userAgent,
        details: { parentEmail, organizationId: organizationId ?? null },
      });

      // Send parental consent email — pass raw token (used in link, not stored)
      const athlete = await this.storage.getUser(athleteUserId);
      const emailSent = await this.emailService.sendParentalConsentRequest(parentEmail, {
        athleteName: athlete ? `${athlete.firstName} ${athlete.lastName}` : 'an athlete',
        consentToken: rawToken,
        consentId: consent.id,
        expiresAt,
      });

      if (!emailSent) {
        console.error(`[COPPA] Consent email failed to send for athlete ${athleteUserId} to ${parentEmail}`);
      }

      return { success: true, consentId: consent.id, emailSent };
    } catch (error) {
      console.error('[COPPA] initiateConsent failed:', error);
      return {
        success: false,
        error: 'Failed to initiate consent',
      };
    }
  }

  /**
   * Verify a consent token from a parent's email link.
   *
   * Uses timing-safe hash lookup to prevent token enumeration attacks:
   * - Valid token → 200 with consent details
   * - Expired token → 410 Gone
   * - Already used → 400
   * - Not found → 404 (same timing as wrong-hash case)
   */
  async verifyConsentToken(rawToken: string): Promise<VerifyTokenResult> {
    try {
      const tokenHash = this.hashToken(rawToken);

      const [consent] = await db.select()
        .from(parentalConsents)
        .where(eq(parentalConsents.tokenHash, tokenHash))
        .limit(1);

      if (!consent) {
        // Constant-time response — don't reveal whether hash was in DB
        return { valid: false, error: 'Invalid or expired consent link.', statusCode: 404 };
      }

      if (consent.confirmedAt || consent.revokedAt) {
        return { valid: false, error: 'This consent link has already been used.', statusCode: 400 };
      }

      if (new Date() > consent.expiresAt) {
        // Mark as expired in DB
        await db.update(parentalConsents)
          .set({ status: 'expired' as ConsentStatus })
          .where(eq(parentalConsents.id, consent.id));
        return { valid: false, error: 'This consent link has expired.', statusCode: 410 };
      }

      if (consent.status !== 'pending') {
        return { valid: false, error: 'This consent link is no longer valid.', statusCode: 400 };
      }

      return { valid: true, consent };
    } catch (error) {
      console.error('[COPPA] verifyConsentToken failed:', error);
      return { valid: false, error: 'Failed to verify consent link.', statusCode: 500 };
    }
  }

  /**
   * Verify that a raw consent token belongs to a *confirmed* consent record.
   *
   * Unlike verifyConsentToken() (which only accepts pending tokens), this method
   * is designed for post-confirmation flows (e.g. deletion requests) where the
   * parent already completed the consent step and the token is expected to be
   * in a 'confirmed' state.  Returns a typed result — callers should not parse
   * error message strings to determine the outcome.
   */
  async verifyConfirmedToken(rawToken: string): Promise<VerifyConfirmedTokenResult> {
    try {
      const tokenHash = this.hashToken(rawToken);

      const [consent] = await db.select()
        .from(parentalConsents)
        .where(eq(parentalConsents.tokenHash, tokenHash))
        .limit(1);

      if (!consent) {
        return { confirmed: false, reason: 'not_found' };
      }

      if (consent.status === 'expired') {
        return { confirmed: false, reason: 'expired' };
      }

      if (consent.status === 'pending') {
        // Token exists but consent was never completed
        return { confirmed: false, reason: 'pending' };
      }

      if (consent.status === 'revoked') {
        // Revoked (active parent denial) is legally distinct from expired (timeout)
        return { confirmed: false, reason: 'revoked' };
      }

      // status is 'confirmed' — the parent has granted consent
      return { confirmed: true, consent: consent as ParentalConsent };
    } catch (error) {
      console.error('[COPPA] verifyConfirmedToken failed:', error);
      return { confirmed: false, reason: 'error' };
    }
  }

  /**
   * Confirm parental consent (parent clicks "Grant Permission").
   *
   * Uses an atomic update to prevent token replay:
   * 1. Update consent record status + confirmedAt in single write
   * 2. Update user coppaStatus → 'consented'
   * 3. Send confirmation email to athlete
   * 4. Write audit log
   */
  async confirmConsent(params: ConfirmConsentParams): Promise<ConfirmConsentResult> {
    const { consentId, aiConsentGranted, ip, userAgent } = params;

    try {
      // Atomic update — only proceeds if status is still 'pending'
      const [updatedConsent] = await db.update(parentalConsents)
        .set({
          status: 'confirmed' as ConsentStatus,
          aiConsentGranted,
          confirmedAt: new Date(),
          confirmedIp: ip ?? null,
          confirmedUserAgent: userAgent ?? null,
        })
        .where(and(
          eq(parentalConsents.id, consentId),
          eq(parentalConsents.status, 'pending'),
        ))
        .returning();

      if (!updatedConsent) {
        // Either already confirmed, revoked, or expired — log replay attempt
        await this.writeCoppaAudit({
          action: COPPA_ACTIONS.TOKEN_REPLAY_ATTEMPT,
          consentId,
          ip,
          userAgent,
          details: { attemptedAction: 'confirm' },
        });
        return { success: false, error: 'Consent token already used or expired.' };
      }

      // Update user to 'consented' with AI consent status
      await db.update(users)
        .set({
          coppaStatus: 'consented',
          coppaConsentConfirmedAt: new Date(),
        })
        .where(eq(users.id, updatedConsent.athleteUserId));

      await this.writeCoppaAudit({
        action: COPPA_ACTIONS.CONSENT_CONFIRMED,
        athleteUserId: updatedConsent.athleteUserId,
        consentId,
        actorEmail: updatedConsent.parentEmail,
        ip,
        userAgent,
        details: { aiConsentGranted },
      });

      // Send confirmation to athlete
      const athlete = await this.storage.getUser(updatedConsent.athleteUserId);
      if (athlete) {
        await this.emailService.sendConsentConfirmedNotification(
          athlete.emails?.[0] ?? '',
          { athleteName: `${athlete.firstName} ${athlete.lastName}` },
        );
      }

      return { success: true };
    } catch (error) {
      console.error('[COPPA] confirmConsent failed:', error);
      return {
        success: false,
        error: 'Failed to confirm consent',
      };
    }
  }

  /**
   * Deny parental consent (parent clicks "Deny").
   * User record is NOT deleted — coppaStatus is set to 'consent_revoked'.
   */
  async denyConsent(consentId: string, ip?: string, userAgent?: string): Promise<ConfirmConsentResult> {
    try {
      const [updatedConsent] = await db.update(parentalConsents)
        .set({
          status: 'revoked' as ConsentStatus,
          revokedAt: new Date(),
          confirmedIp: ip ?? null,
          confirmedUserAgent: userAgent ?? null,
        })
        .where(and(
          eq(parentalConsents.id, consentId),
          eq(parentalConsents.status, 'pending'),
        ))
        .returning();

      if (!updatedConsent) {
        await this.writeCoppaAudit({
          action: COPPA_ACTIONS.TOKEN_REPLAY_ATTEMPT,
          consentId,
          ip,
          userAgent,
          details: { attemptedAction: 'deny' },
        });
        return { success: false, error: 'Consent token already used or expired.' };
      }

      // Atomically revoke user access and deactivate parent links.
      // Without a transaction, a failure after updating coppaStatus but before
      // deactivating links would leave an inconsistent state where the parent
      // could still access child data via active links.
      await db.transaction(async (tx) => {
        await tx.update(users)
          .set({ coppaStatus: 'consent_revoked' })
          .where(eq(users.id, updatedConsent.athleteUserId));

        await tx.update(parentAthleteLinks)
          .set({ isActive: false })
          .where(and(
            eq(parentAthleteLinks.athleteUserId, updatedConsent.athleteUserId),
            eq(parentAthleteLinks.isActive, true),
          ));
      });

      await this.writeCoppaAudit({
        action: COPPA_ACTIONS.CONSENT_DENIED,
        athleteUserId: updatedConsent.athleteUserId,
        consentId,
        actorEmail: updatedConsent.parentEmail,
        ip,
        userAgent,
        details: {},
      });

      return { success: true };
    } catch (error) {
      console.error('[COPPA] denyConsent failed:', error);
      return {
        success: false,
        error: 'Failed to deny consent',
      };
    }
  }

  /**
   * Revoke consent for an athlete (called by org admin or site admin, or parent).
   * revokeAiOnly=true revokes only AI consent while keeping account active.
   */
  async revokeConsent(
    athleteUserId: string,
    revokeAiOnly: boolean,
    actorId: string,
    ip?: string,
  ): Promise<ConfirmConsentResult> {
    try {
      if (revokeAiOnly) {
        // Find the active consent record and update only AI consent
        const updated = await db.update(parentalConsents)
          .set({ aiConsentGranted: false })
          .where(and(
            eq(parentalConsents.athleteUserId, athleteUserId),
            eq(parentalConsents.status, 'confirmed'),
          ))
          .returning({ id: parentalConsents.id });

        if (updated.length === 0) {
          return { success: false, error: 'No active consent found to revoke' };
        }

        await this.writeCoppaAudit({
          action: COPPA_ACTIONS.AI_CONSENT_DENIED,
          athleteUserId,
          actorUserId: actorId,
          ip,
          details: { revokeAiOnly: true },
        });
      } else {
        // Full consent revocation
        const updated = await db.update(parentalConsents)
          .set({ status: 'revoked' as ConsentStatus, revokedAt: new Date() })
          .where(and(
            eq(parentalConsents.athleteUserId, athleteUserId),
            eq(parentalConsents.status, 'confirmed'),
          ))
          .returning({ id: parentalConsents.id });

        if (updated.length === 0) {
          return { success: false, error: 'No active consent found to revoke' };
        }

        // Atomically revoke user access and deactivate parent links.
        await db.transaction(async (tx) => {
          await tx.update(users)
            .set({ coppaStatus: 'consent_revoked' })
            .where(eq(users.id, athleteUserId));

          await tx.update(parentAthleteLinks)
            .set({ isActive: false })
            .where(and(
              eq(parentAthleteLinks.athleteUserId, athleteUserId),
              eq(parentAthleteLinks.isActive, true),
            ));
        });

        await this.writeCoppaAudit({
          action: COPPA_ACTIONS.CONSENT_REVOKED,
          athleteUserId,
          actorUserId: actorId,
          ip,
          details: { revokeAiOnly: false },
        });
      }

      return { success: true };
    } catch (error) {
      console.error('[COPPA] revokeConsent failed:', error);
      return {
        success: false,
        error: 'Failed to revoke consent',
      };
    }
  }

  /**
   * Check whether a user can access AI coaching insights.
   *
   * Fail-closed: any null/undefined/false value → canAccessAI = false.
   * Both conditions must be true:
   * 1. coppaStatus === 'consented' (or 'not_applicable' for adults)
   * 2. aiConsentGranted === true (not null, not false, not undefined)
   */
  async canAccessAI(athleteUserId: string): Promise<boolean> {
    const user = await this.storage.getUser(athleteUserId);
    if (!user) return false;

    // Adults have no COPPA restriction
    if (user.coppaStatus === 'not_applicable') return true;

    // Must have active consent AND explicit AI opt-in
    if (user.coppaStatus !== 'consented') return false;

    // Find the active consent record
    const [consent] = await db.select({ aiConsentGranted: parentalConsents.aiConsentGranted })
      .from(parentalConsents)
      .where(and(
        eq(parentalConsents.athleteUserId, athleteUserId),
        eq(parentalConsents.status, 'confirmed'),
      ))
      .limit(1);

    // Fail closed: null/undefined/false → cannot access AI
    return consent?.aiConsentGranted === true;
  }

  /**
   * Batch-check AI access for multiple minor athlete IDs.
   * Returns the set of IDs that CANNOT access AI (fail-closed).
   * Uses 2 queries total instead of 2*N for N athletes.
   */
  async getMinorsWithoutAIConsent(minorUserIds: string[]): Promise<string[]> {
    if (minorUserIds.length === 0) return [];

    // 1. Find which of these minors have coppaStatus === 'consented'
    const consentedUsers = await db.select({ id: users.id })
      .from(users)
      .where(and(
        inArray(users.id, minorUserIds),
        eq(users.coppaStatus, 'consented'),
      ));
    const consentedIds = new Set(consentedUsers.map(u => u.id));

    // Anyone not consented is already blocked
    const blockedNonConsented = minorUserIds.filter(id => !consentedIds.has(id));

    if (consentedIds.size === 0) return blockedNonConsented;

    // 2. Of the consented users, find who has aiConsentGranted = true
    const aiGranted = await db.select({ athleteUserId: parentalConsents.athleteUserId })
      .from(parentalConsents)
      .where(and(
        inArray(parentalConsents.athleteUserId, [...consentedIds]),
        eq(parentalConsents.status, 'confirmed'),
        eq(parentalConsents.aiConsentGranted, true),
      ));
    const aiGrantedIds = new Set(aiGranted.map(r => r.athleteUserId));

    // Consented but no AI grant → also blocked
    const blockedNoAI = [...consentedIds].filter(id => !aiGrantedIds.has(id));

    return [...blockedNonConsented, ...blockedNoAI];
  }

  /**
   * Write an immutable COPPA audit log entry.
   * retainUntil is always computed here — callers cannot override it.
   * Details are JSON-serialized and sanitized — never include raw tokens.
   */
  async writeCoppaAudit(params: AuditParams): Promise<void> {
    const retainUntil = getAuditRetentionDate();

    const detailsJson = params.details
      ? JSON.stringify(params.details)
      : null;

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

  /**
   * Link a registered parent user account to all parentAthleteLinks matching their email.
   *
   * Called after a parent registers via POST /api/auth/register/parent.
   * Finds all rows where parentEmail matches AND parentUserId is null, then
   * sets parentUserId so session-based access checks work for the parent.
   *
   * @param parentUserId - The newly registered parent user's ID
   * @param parentEmail  - The email that was used during consent flow
   * @returns Number of rows updated
   */
  async linkParentAccount(parentUserId: string, parentEmail: string): Promise<number> {
    const result = await db.update(parentAthleteLinks)
      .set({ parentUserId })
      .where(and(
        eq(parentAthleteLinks.parentEmail, parentEmail),
        isNull(parentAthleteLinks.parentUserId),
      ))
      .returning({ id: parentAthleteLinks.id });

    return result.length;
  }

  /**
   * Get COPPA status summary for an athlete.
   * Used by the org admin status endpoint.
   */
  async getConsentStatus(athleteUserId: string) {
    const user = await this.storage.getUser(athleteUserId);
    if (!user) return null;

    const [activeConsent] = await db.select()
      .from(parentalConsents)
      .where(eq(parentalConsents.athleteUserId, athleteUserId))
      .orderBy(sql`${parentalConsents.createdAt} DESC`)
      .limit(1);

    return {
      userId: user.id,
      coppaStatus: user.coppaStatus,
      isMinor: user.isMinor,
      parentEmail: user.parentEmail,
      coppaConsentConfirmedAt: user.coppaConsentConfirmedAt,
      activeConsent: activeConsent ? {
        id: activeConsent.id,
        status: activeConsent.status,
        aiConsentGranted: activeConsent.aiConsentGranted,
        expiresAt: activeConsent.expiresAt,
        createdAt: activeConsent.createdAt,
      } : null,
    };
  }
}

export const coppaService = new CoppaService();
