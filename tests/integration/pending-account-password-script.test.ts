/**
 * The repair script finds accounts whose stored password is a hash of the not-yet-set placeholder,
 * changes nothing by default, and with --apply moves them to the unhashed placeholder.
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import { describe, it, expect, afterAll, vi } from 'vitest';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { storage } from '../../packages/api/storage';
import { users, sessions, securityEvents, INVITATION_PENDING_PASSWORD } from '@shared/schema';
import { purgeTestRows } from '../helpers/purge-test-rows';
import { findHashedPlaceholderAccounts, resetToPendingState } from '../../scripts/repair-pending-account-passwords';

const PREFIX = 'pendscript';

describe('pending account password repair script', () => {
  let seq = 0;
  async function makeUser(password: string, isActive = true) {
    const u = `${Date.now()}${seq++}`;
    const user = await storage.createUser({
      username: `${PREFIX}${u}`, emails: [`${PREFIX}${u}@test.com`], firstName: 'S', lastName: 'T', password: 'RealPass123!x', role: 'athlete',
    });
    await db.update(users).set({ password, isActive }).where(eq(users.id, user.id));
    return user.id;
  }

  afterAll(async () => {
    await purgeTestRows({ usernameLike: [`${PREFIX}%`] });
  });

  it('lists only accounts holding a hash of the placeholder, and rewrites them only when applied', async () => {
    const hashed = await makeUser(await bcrypt.hash(INVITATION_PENDING_PASSWORD, 4));
    const hashedInactive = await makeUser(await bcrypt.hash(INVITATION_PENDING_PASSWORD, 4), false);
    const unhashed = await makeUser(INVITATION_PENDING_PASSWORD);
    const real = await makeUser(await bcrypt.hash('RealPass123!x', 4));

    const found = await findHashedPlaceholderAccounts();
    const ids = found.map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining([hashed, hashedInactive]));
    expect(ids).not.toContain(unhashed);
    expect(ids).not.toContain(real);
    const row = found.find((a) => a.id === hashedInactive)!;
    expect(row.isActive).toBe(false);
    expect(row).not.toHaveProperty('emails');
    expect(row).toHaveProperty('lastLoginAt');

    // Listing changed nothing
    expect((await storage.getUser(hashed))!.password).not.toBe(INVITATION_PENDING_PASSWORD);

    const ours = found.filter((a) => a.id === hashed || a.id === hashedInactive);
    expect(await resetToPendingState(ours)).toBe(2);
    expect((await storage.getUser(hashed))!.password).toBe(INVITATION_PENDING_PASSWORD);
    expect((await storage.getUser(hashedInactive))!.password).toBe(INVITATION_PENDING_PASSWORD);
    expect((await storage.getUser(hashedInactive))!.isActive).toBe(false);
    expect((await findHashedPlaceholderAccounts()).map((a) => a.id)).not.toContain(hashed);
  });

  it('signs the account out, including sessions whose user_id column is not filled yet, and logs each rewritten id', async () => {
    const id = await makeUser(await bcrypt.hash(INVITATION_PENDING_PASSWORD, 4));
    const sid = `${PREFIX}sid${Date.now()}`;
    // user_id is only synced on a session's first request after sign-in: only the payload names the user
    await db.insert(sessions).values({ sid, sess: { cookie: {}, user: { id } }, expire: new Date(Date.now() + 3600_000) });
    const found = (await findHashedPlaceholderAccounts()).filter((a) => a.id === id);
    const log = vi.spyOn(console, 'log');
    try {
      expect(await resetToPendingState(found)).toBe(1);
      expect(log.mock.calls.some((c) => String(c[0]).includes(id))).toBe(true);
    } finally {
      log.mockRestore();
    }
    expect(await db.select().from(sessions).where(eq(sessions.sid, sid))).toHaveLength(0);
  });

  it('records a security event for each rewritten account, and none for a skipped one', async () => {
    const id = await makeUser(await bcrypt.hash(INVITATION_PENDING_PASSWORD, 4));
    const found = (await findHashedPlaceholderAccounts()).filter((a) => a.id === id);
    const events = () => db.select().from(securityEvents).where(eq(securityEvents.userId, id));
    expect(await resetToPendingState(found)).toBe(1);
    // The second run finds the stored value changed and rewrites nothing
    expect(await resetToPendingState(found)).toBe(0);
    const rows = (await events()).filter((e) => e.eventType === 'password_reset_to_pending');
    expect(rows).toHaveLength(1);
    expect(rows[0].severity).toBe('warning');
    expect(rows[0].eventData ?? '').not.toContain('$2');
  });

  it('does not overwrite a password set after the listing', async () => {
    const id = await makeUser(await bcrypt.hash(INVITATION_PENDING_PASSWORD, 4));
    const found = (await findHashedPlaceholderAccounts()).filter((a) => a.id === id);
    const newHash = await bcrypt.hash('ChosenPass123!x', 4);
    await db.update(users).set({ password: newHash }).where(eq(users.id, id));
    expect(await resetToPendingState(found)).toBe(0);
    expect((await storage.getUser(id))!.password).toBe(newHash);
  });
});
