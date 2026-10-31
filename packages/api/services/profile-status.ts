import { and, eq } from 'drizzle-orm';
import { isMinorAge } from '@shared/coppa-utils';
import { db } from '../db';
import { users, userOrganizations } from '@shared/schema';
import { parentAthleteLinks } from '@shared/schema/tables/coppa';
import { getMissingProfileFields, type MissingProfileField } from './profile-completion';

export interface ProfileStatus {
  missing: MissingProfileField[];
  coppaStatus: string;
  /** False for minors and any non-'not_applicable' consent state: those are re-checked on every request. */
  cacheable: boolean;
}

/** Loads the user, org memberships and parent link fresh from the DB (never the session cache). */
export async function loadProfileStatus(userId: string): Promise<ProfileStatus | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  const [orgs, [link]] = await Promise.all([
    db.select({ role: userOrganizations.role }).from(userOrganizations).where(eq(userOrganizations.userId, userId)),
    db.select({ id: parentAthleteLinks.id }).from(parentAthleteLinks)
      .where(and(eq(parentAthleteLinks.parentUserId, userId), eq(parentAthleteLinks.isActive, true)))
      .limit(1),
  ]);
  let minorByDob = false;
  try { minorByDob = !!user.birthDate && isMinorAge(user.birthDate); } catch { /* unparseable: treat as minor below */ minorByDob = true; }
  return {
    missing: getMissingProfileFields(user, orgs, !!link),
    coppaStatus: user.coppaStatus,
    cacheable: !user.isMinor && !minorByDob && user.coppaStatus === 'not_applicable',
  };
}
