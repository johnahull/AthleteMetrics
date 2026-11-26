/**
 * Find accounts whose stored password is a bcrypt hash of the not-yet-set placeholder
 * (INVITATION_PENDING_PASSWORD) and, with --apply, store the placeholder unhashed instead.
 *
 * The unhashed placeholder is the pending state that new accounts get: no password matches it, and
 * every reader of the placeholder treats it as "not set yet". Applying also signs the account out
 * everywhere (deletes its sessions). Rows whose password changed after the listing are left alone.
 *
 * Output has no emails: id, isActive, deletedAt, lastLoginAt and the number of recorded successful
 * sign-ins (security_events.event_type = 'login_success').
 *
 * Applying also writes one security_events row per rewritten account (password_reset_to_pending).
 *
 * Usage, after the code change is deployed:
 *   1. DATABASE_URL="..." npx tsx scripts/repair-pending-account-passwords.ts            # dry run (default)
 *   2. Save the output and review the listed accounts and their sign-in dates.
 *   3. DATABASE_URL="..." npx tsx scripts/repair-pending-account-passwords.ts --apply    # rewrite, off-peak
 * On Railway, prefix the command with `railway run`. It compares every stored hash one by one, so expect
 * minutes on a database with many thousands of accounts. Running it again is safe.
 */

import bcrypt from 'bcrypt';
import { pathToFileURL } from 'url';
import { and, eq, inArray, like, sql } from 'drizzle-orm';
import { deleteUserSessions } from '../packages/api/lib/session-helpers';
import { db } from '../packages/api/db';
import { users, securityEvents, INVITATION_PENDING_PASSWORD } from '../packages/shared/schema';

export interface HashedPlaceholderAccount {
  id: string;
  password: string;
  isActive: boolean | null;
  deletedAt: Date | null;
  lastLoginAt: Date | null;
}

const COMPARE_BATCH = 8;

export async function findHashedPlaceholderAccounts(): Promise<HashedPlaceholderAccount[]> {
  // Every bcrypt hash must be compared: there is no other way to tell a hash of the placeholder apart.
  const rows = await db.select({
    id: users.id,
    password: users.password,
    isActive: users.isActive,
    deletedAt: users.deletedAt,
    lastLoginAt: users.lastLoginAt,
  }).from(users).where(like(users.password, '$2%'));

  const found: HashedPlaceholderAccount[] = [];
  for (let i = 0; i < rows.length; i += COMPARE_BATCH) {
    const batch = rows.slice(i, i + COMPARE_BATCH);
    const matches = await Promise.all(batch.map((r) => bcrypt.compare(INVITATION_PENDING_PASSWORD, r.password!)));
    batch.forEach((r, j) => { if (matches[j]) found.push(r as HashedPlaceholderAccount); });
  }
  return found;
}

/** Store the unhashed placeholder, delete the sessions and record a security event for each account. Returns the number rewritten. */
export async function resetToPendingState(accounts: HashedPlaceholderAccount[]): Promise<number> {
  let rewritten = 0;
  for (const a of accounts) {
    const done = await db.transaction(async (tx) => {
      // Only if the stored hash is still the one listed: a password set since then is kept
      const updated = await tx.update(users)
        .set({ password: INVITATION_PENDING_PASSWORD })
        .where(and(eq(users.id, a.id), eq(users.password, a.password)))
        .returning({ id: users.id });
      if (updated.length === 0) return false;
      await deleteUserSessions(a.id, tx);
      await tx.insert(securityEvents).values({
        userId: a.id,
        eventType: 'password_reset_to_pending',
        eventData: JSON.stringify({ source: 'repair-pending-account-passwords', sessionsDeleted: true }),
        ipAddress: '0.0.0.0',
        severity: 'warning',
      });
      return true;
    });
    if (done) {
      rewritten++;
      console.log(`[repair-pending-account-passwords] rewritten to pending, sessions deleted: ${a.id}`);
    }
  }
  return rewritten;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const accounts = await findHashedPlaceholderAccounts();
  const ids = accounts.map((a) => a.id);

  const signIns = ids.length === 0 ? [] : await db.select({
    userId: securityEvents.userId,
    count: sql<number>`count(*)::int`,
    last: sql<Date | null>`max(${securityEvents.createdAt})`,
  }).from(securityEvents)
    .where(and(inArray(securityEvents.userId, ids), eq(securityEvents.eventType, 'login_success')))
    .groupBy(securityEvents.userId);
  const byUser = new Map(signIns.map((s) => [s.userId, s]));

  console.log(`Accounts holding a hash of the placeholder: ${accounts.length}`);
  console.table(accounts.map((a) => ({
    id: a.id,
    isActive: a.isActive,
    deleted: a.deletedAt !== null,
    lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
    loginSuccessEvents: byUser.get(a.id)?.count ?? 0,
    lastLoginSuccessEvent: byUser.get(a.id)?.last ?? null,
  })));

  if (!apply) {
    console.log('Dry run: nothing changed. Re-run with --apply to store the unhashed placeholder and sign these accounts out.');
    return;
  }
  const rewritten = await resetToPendingState(accounts);
  console.log(`Rewritten: ${rewritten} of ${accounts.length}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
