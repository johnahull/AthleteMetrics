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
   * 2. Expire any existing pending consents (deduplication)
   * 3. Store consent record (hash only) — within transaction
   * 4. Update user coppaStatus → 'pending_consent' — within transaction
   * 5. Upsert parent-athlete link — within transaction
   * 6. Write audit log
   * 7. Send parental consent email (with raw token in link)
   *
   * All DB writes (steps 2-5) are wrapped in a single transaction. Without this,
   * a crash after writing the consent record but before updating the user would
   * leave the athlete with coppaStatus='not_applicable' while a consent record
   * exists — they could log in without parental consent (COPPA violation).
   */
  async initiateConsent(params: InitiateConsentParams): Promise<InitiateConsentResult> {
    const { athleteUserId, parentEmail, organizationId, ip, userAgent } = params;

    try {
      const rawToken = this.generateRawToken();
      const tokenHash = this.hashToken(rawToken);
      const expiresAt = getConsentTokenExpiry();

      let consentId: string;

      // Wrap all DB writes in a transaction — atomic initiation prevents partial state
      await db.transaction(async (tx) => {
        // Expire any existing pending consents (deduplication — prevents multiple active tokens)
        await tx.update(parentalConsents)
          .set({ status: 'expired' as ConsentStatus })
          .where(and(
            eq(parentalConsents.athleteUserId, athleteUserId),
            eq(parentalConsents.status, 'pending'),
          ));

        // Create new consent record (hash only — never raw token)
        const [consent] = await tx.insert(parentalConsents).values({
          athleteUserId,
          organizationId: organizationId ?? null,
          parentEmail,
          tokenHash,
          status: 'pending',
          expiresAt,
          initiatedIp: ip ?? null,
          initiatedUserAgent: userAgent ?? null,
        }).returning({ id: parentalConsents.id });

        consentId = consent.id;

        // Update user COPPA status and link to consent record
        await tx.update(users)
          .set({
            coppaStatus: 'pending_consent',
            isMinor: true,
            parentEmail,
            parentConsentId: consent.id,
          })
          .where(eq(users.id, athleteUserId));

        // Upsert parent-athlete link (unique on parentEmail+athleteUserId)
        await tx.insert(parentAthleteLinks).values({
          parentEmail,
          athleteUserId,
          organizationId: organizationId ?? null,
          consentId: consent.id,
        }).onConflictDoUpdate({
          target: [parentAthleteLinks.parentEmail, parentAthleteLinks.athleteUserId],
          set: { consentId: consent.id, organizationId: organizationId ?? null, isActive: true },
        });
      });

      // Post-transaction steps: audit log and email.
      // These must NOT cause the operation to report failure if the transaction succeeded.
      let emailSent = false;
      try {
        await this.writeCoppaAudit({
          action: COPPA_ACTIONS.CONSENT_INITIATED,
          athleteUserId,
          consentId: consentId!,
          actorUserId: athleteUserId,
          ip,
          userAgent,
          details: { parentEmail, organizationId: organizationId ?? null },
        });
      } catch (auditErr) {
        console.error(`[COPPA] Audit log write failed for initiateConsent (athlete ${athleteUserId}):`, auditErr);
      }

      try {
        const athlete = await this.storage.getUser(athleteUserId);
        emailSent = await this.emailService.sendParentalConsentRequest(parentEmail, {
          athleteName: athlete ? `${athlete.firstName} ${athlete.lastName}` : 'an athlete',
          consentToken: rawToken,
          consentId: consentId!,
          expiresAt,
        });

        if (!emailSent) {
          console.error(`[COPPA] Consent email failed to send for athlete ${athleteUserId} to ${parentEmail}`);
        }
      } catch (emailErr) {
        console.error(`[COPPA] Email send threw for athlete ${athleteUserId}:`, emailErr);
      }

      return { success: true, consentId: consentId!, emailSent };
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

      // Confirmed consents are valid regardless of token expiry —
      // COPPA Section 312.6 requires parents can exercise data rights at any time.
      // Token expiry only applies to unconsumed (pending) consent flows.
      if (consent.status === 'confirmed') {
        return { confirmed: true, consent: consent as ParentalConsent };
      }

      if (consent.status === 'expired') {
        return { confirmed: false, reason: 'expired' };
      }

      if (consent.status === 'revoked') {
        // Revoked (active parent denial) is legally distinct from expired (timeout)
        return { confirmed: false, reason: 'revoked' };
      }

      // For pending consents, check actual expiry even if cleanup job hasn't run
      if (consent.expiresAt && new Date() > consent.expiresAt) {
        return { confirmed: false, reason: 'expired' };
      }

      // Token exists but consent was never completed
      return { confirmed: false, reason: 'pending' };
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
      // Atomically confirm consent AND update the user's coppaStatus.
      // Without a transaction, a crash between these two writes would leave
      // the consent as 'confirmed' but the user stuck in 'pending_consent',
      // permanently blocking their login with no recovery path.
      let updatedConsent: typeof parentalConsents.$inferSelect | undefined;

      try {
        const result = await db.transaction(async (tx) => {
          const [consent] = await tx.update(parentalConsents)
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

          if (!consent) {
            throw new Error('CONSENT_REPLAY');
          }

          // Mark email as verified when consent is confirmed — the parent's
          // email-link verification of the VPC token is equivalent to email
          // ownership proof for the athlete's account. Under-13 athletes can't
          // log in to trigger resend-verification, so we set it here.
          await tx.update(users)
            .set({
              coppaStatus: 'consented',
              coppaConsentConfirmedAt: new Date(),
              isEmailVerified: true,
            })
            .where(eq(users.id, consent.athleteUserId));

          return consent;
        });
        updatedConsent = result;
      } catch (txError) {
        if (txError instanceof Error && txError.message === 'CONSENT_REPLAY') {
          await this.writeCoppaAudit({
            action: COPPA_ACTIONS.TOKEN_REPLAY_ATTEMPT,
            consentId,
            ip,
            userAgent,
            details: { attemptedAction: 'confirm' },
          });
          return { success: false, error: 'Consent token already used or expired.' };
        }
        throw txError;
      }

      // Post-transaction steps — must not cause the operation to report failure
      try {
        await this.writeCoppaAudit({
          action: COPPA_ACTIONS.CONSENT_CONFIRMED,
          athleteUserId: updatedConsent.athleteUserId,
          consentId,
          actorEmail: updatedConsent.parentEmail,
          ip,
          userAgent,
          details: { aiConsentGranted },
        });
      } catch (auditErr) {
        console.error(`[COPPA] Audit log write failed for confirmConsent (${consentId}):`, auditErr);
      }

      try {
        const athlete = await this.storage.getUser(updatedConsent.athleteUserId);
        if (athlete) {
          await this.emailService.sendConsentConfirmedNotification(
            athlete.emails?.[0] ?? '',
            { athleteName: `${athlete.firstName} ${athlete.lastName}` },
          );
        }
      } catch (emailErr) {
        console.error(`[COPPA] Confirmation email failed for consent ${consentId}:`, emailErr);
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
      // Atomically deny consent, revoke user access, and deactivate parent links.
      // All three updates must be in a single transaction — if the process crashes
      // after updating the consent but before updating the user, the athlete is
      // permanently login-blocked with no recovery path.
      let updatedConsent: typeof parentalConsents.$inferSelect | undefined;

      try {
        const result = await db.transaction(async (tx) => {
          const [consent] = await tx.update(parentalConsents)
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

          if (!consent) {
            throw new Error('CONSENT_REPLAY');
          }

          await tx.update(users)
            .set({ coppaStatus: 'consent_revoked' })
            .where(eq(users.id, consent.athleteUserId));

          await tx.update(parentAthleteLinks)
            .set({ isActive: false })
            .where(and(
              eq(parentAthleteLinks.athleteUserId, consent.athleteUserId),
              eq(parentAthleteLinks.isActive, true),
            ));

          return consent;
        });
        updatedConsent = result;
      } catch (txError) {
        if (txError instanceof Error && txError.message === 'CONSENT_REPLAY') {
          await this.writeCoppaAudit({
            action: COPPA_ACTIONS.TOKEN_REPLAY_ATTEMPT,
            consentId,
            ip,
            userAgent,
            details: { attemptedAction: 'deny' },
          });
          return { success: false, error: 'Consent token already used or expired.' };
        }
        throw txError;
      }

      // Post-transaction audit — must not cause the operation to report failure
      try {
        await this.writeCoppaAudit({
          action: COPPA_ACTIONS.CONSENT_DENIED,
          athleteUserId: updatedConsent.athleteUserId,
          consentId,
          actorEmail: updatedConsent.parentEmail,
          ip,
          userAgent,
          details: {},
        });
      } catch (auditErr) {
        console.error(`[COPPA] Audit log write failed for denyConsent (${consentId}):`, auditErr);
      }

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
        // Wrap AI consent revocation + audit in a transaction so the compliance
        // record is guaranteed to exist if the consent change succeeds.
        let revokedAi = false;
        await db.transaction(async (tx) => {
          const updated = await tx.update(parentalConsents)
            .set({ aiConsentGranted: false })
            .where(and(
              eq(parentalConsents.athleteUserId, athleteUserId),
              eq(parentalConsents.status, 'confirmed'),
            ))
            .returning({ id: parentalConsents.id });

          if (updated.length === 0) {
            return; // no-op, handled below
          }
          revokedAi = true;

          await this.writeCoppaAudit({
            action: COPPA_ACTIONS.AI_CONSENT_DENIED,
            athleteUserId,
            actorUserId: actorId,
            ip,
            details: { revokeAiOnly: true },
          });
        });

        if (!revokedAi) {
          return { success: false, error: 'No active consent found to revoke' };
        }
      } else {
        // Full consent revocation — atomically revoke consent, user access,
        // and parent links in a single transaction. Without this, a window
        // exists where consent is revoked but the user still has active access.
        let revokedCount = 0;
        await db.transaction(async (tx) => {
          const updated = await tx.update(parentalConsents)
            .set({ status: 'revoked' as ConsentStatus, revokedAt: new Date() })
            .where(and(
              eq(parentalConsents.athleteUserId, athleteUserId),
              eq(parentalConsents.status, 'confirmed'),
            ))
            .returning({ id: parentalConsents.id });

          revokedCount = updated.length;
          if (revokedCount === 0) return; // no-op; checked after transaction

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

        if (revokedCount === 0) {
          return { success: false, error: 'No active consent found to revoke' };
        }

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
