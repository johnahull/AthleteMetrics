/**
 * Helper for managing parentEmail updates on athlete profiles.
 *
 * Shared between:
 *  - PUT /api/athletes/:id  (coach/admin updating an athlete)
 *  - PUT /api/profile       (athlete updating their own profile)
 *
 * Behaviour:
 *  1. Updates the users.parent_email column via storage.updateUser().
 *  2. When a non-null email is provided and the athlete is a minor (age < 18
 *     based on birthDate), inserts a parentAthleteLinks row if one does not
 *     already exist for that (athleteUserId, parentEmail, isActive=true) pair.
 *  3. Fires off a parent-notification email (fire-and-forget).
 *  4. When parentEmail is undefined the function is a no-op (field absent from
 *     the request payload).
 */

import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import { parentAthleteLinks } from '@shared/schema/tables/coppa';
import { isMinorAge } from '@shared/coppa-utils';
import { emailService } from './email-service';
import { storage } from '../storage';

export async function handleParentEmailUpdate(
  athleteUserId: string,
  parentEmail: string | null | undefined,
  athleteInfo: { firstName: string; birthDate?: string | null },
  organizationId?: string | null,
): Promise<void> {
  // Field not present in the request payload — nothing to do
  if (parentEmail === undefined) return;

  // 1. Persist the new value (null clears it)
  await storage.updateUser(athleteUserId, { parentEmail: parentEmail ?? null });

  // 2. If parentEmail is cleared, deactivate all active parent links.
  // This revokes the parent's read access via requireParentAccess middleware.
  if (parentEmail === null) {
    await db.update(parentAthleteLinks)
      .set({ isActive: false })
      .where(and(
        eq(parentAthleteLinks.athleteUserId, athleteUserId),
        eq(parentAthleteLinks.isActive, true),
      ));
    return;
  }

  // 3. If a real email + minor athlete → create link (de-duplicated)
  if (parentEmail && athleteInfo.birthDate) {
    let minor = false;
    try {
      minor = isMinorAge(athleteInfo.birthDate);
    } catch {
      // birthDate is unparseable — treat as non-minor (safe default)
    }

    if (minor) {
      const normalised = parentEmail.toLowerCase();

      const existing = await db
        .select({ id: parentAthleteLinks.id })
        .from(parentAthleteLinks)
        .where(
          and(
            eq(parentAthleteLinks.athleteUserId, athleteUserId),
            eq(parentAthleteLinks.parentEmail, normalised),
            eq(parentAthleteLinks.isActive, true),
          ),
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(parentAthleteLinks).values({
          parentEmail: normalised,
          athleteUserId,
          organizationId: organizationId ?? null,
          isActive: true,
        });

        // Fire-and-forget — do not block the update on email delivery
        emailService
          .sendParentNotification({
            parentEmail: normalised,
            athleteFirstName: athleteInfo.firstName,
          })
          .catch((err: unknown) => {
            console.error('[parent-link-helper] notification email failed:', err);
          });
      }
    }
  }
}
