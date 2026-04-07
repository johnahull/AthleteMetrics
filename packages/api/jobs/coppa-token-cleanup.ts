/**
 * COPPA Consent Token Expiry Cleanup Job
 *
 * Runs daily to find parental consent records that have passed their
 * expiry timestamp but are still in 'pending' status, and transitions
 * them to 'expired'. Writes a TOKEN_EXPIRED audit log entry per record.
 *
 * This is complementary to the on-demand expiry check in
 * coppa-service.verifyConsentToken() — that handles tokens presented
 * at runtime; this job handles tokens that are never presented again.
 *
 * Schedule: daily at 03:00 UTC (low-traffic window)
 */

import cron, { type ScheduledTask } from 'node-cron';
import { db } from '../db';
import { parentalConsents } from '@shared/schema/tables/coppa';
import { coppaService } from '../services/coppa-service';
import { COPPA_ACTIONS } from '@shared/coppa-utils';
import { and, eq, lt, sql } from 'drizzle-orm';
import type { ConsentStatus } from '@shared/schema';

let scheduledTask: ScheduledTask | null = null;

/**
 * Find all parental consent records that are past their expiry date
 * but still in 'pending' status, mark them as 'expired', and write
 * TOKEN_EXPIRED audit log entries.
 *
 * Exported so tests can invoke it directly without the cron scheduler.
 */
const CLEANUP_BATCH_SIZE = 500;

export async function cleanupExpiredTokens(): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;

  try {
    // Process expired pending consents in batches to avoid loading the entire table
    // into memory. Each batch queries from the top of the remaining pending set —
    // no offset needed because processed records transition to 'expired' and are
    // excluded by the WHERE clause on the next iteration.
    let batchHadRecords = true;
    while (batchHadRecords) {
      const expiredConsents = await db.select({
        id: parentalConsents.id,
        athleteUserId: parentalConsents.athleteUserId,
        expiresAt: parentalConsents.expiresAt,
      })
        .from(parentalConsents)
        .where(
          and(
            eq(parentalConsents.status, 'pending'),
            lt(parentalConsents.expiresAt, sql`now()`),
          )
        )
        .limit(CLEANUP_BATCH_SIZE);

      batchHadRecords = expiredConsents.length === CLEANUP_BATCH_SIZE;

      const batchProcessed = processed;
      const batchErrors = errors;

      for (const consent of expiredConsents) {
        try {
          // Atomic update: only transitions if still 'pending'
          const [updated] = await db.update(parentalConsents)
            .set({ status: 'expired' as ConsentStatus })
            .where(
              and(
                eq(parentalConsents.id, consent.id),
                eq(parentalConsents.status, 'pending'),
              )
            )
            .returning({ id: parentalConsents.id, athleteUserId: parentalConsents.athleteUserId });

          if (!updated) {
            // Race condition — another process already handled this record
            continue;
          }

          // If the athlete's coppaStatus is still 'pending_consent', it reflects
          // the now-expired consent — leave as-is (athlete can re-initiate the flow).
          // We intentionally do NOT change coppaStatus here: the athlete account
          // remains in pending_consent state so they can request a new consent email.

          // Write audit log entry
          await coppaService.writeCoppaAudit({
            action: COPPA_ACTIONS.TOKEN_EXPIRED,
            athleteUserId: updated.athleteUserId,
            consentId: updated.id,
            details: { expiredAt: consent.expiresAt?.toISOString() ?? null },
          });

          processed++;
        } catch (err) {
          errors++;
          console.error(`[COPPA cleanup] Failed to expire consent ${consent.id}:`, err);
        }
      }

      // Zero-progress guard: if every record in this batch failed the per-record
      // UPDATE (e.g. persistent DB error), the records stay 'pending' and will be
      // re-selected on the next iteration, creating an infinite loop when the count
      // equals exactly CLEANUP_BATCH_SIZE. Break to avoid spinning.
      if (processed === batchProcessed && errors === batchErrors) {
        break;
      }
    }

    if (processed > 0 || errors > 0) {
      console.log(`[COPPA cleanup] Token expiry run complete: ${processed} expired, ${errors} errors`);
    }
  } catch (err) {
    console.error('[COPPA cleanup] Fatal error during token expiry cleanup:', err);
    errors++;
  }

  return { processed, errors };
}

/**
 * Start the daily cleanup cron job.
 * Call this once from server startup.
 */
export function startCoppaTokenCleanupJob(): void {
  if (scheduledTask) {
    console.warn('[COPPA cleanup] Job already started — ignoring duplicate startCoppaTokenCleanupJob() call');
    return;
  }

  // Run at 03:00 UTC every day
  scheduledTask = cron.schedule('0 3 * * *', async () => {
    console.log('[COPPA cleanup] Starting expired token cleanup...');
    await cleanupExpiredTokens();
  }, {
    timezone: 'UTC',
  });

  console.log('[COPPA cleanup] Token expiry cleanup job scheduled (daily at 03:00 UTC)');
}

/**
 * Stop the cron job (used in graceful shutdown).
 */
export function stopCoppaTokenCleanupJob(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('[COPPA cleanup] Token expiry cleanup job stopped');
  }
}
