import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { users, userOrganizations } from '@shared/schema';
import { parentAthleteLinks } from '@shared/schema/tables/coppa';
import { getMissingProfileFields, type MissingProfileField } from './profile-completion';

export interface ProfileStatus {
  missing: MissingProfileField[];
  coppaStatus: string;
}

/** Loads the user, org memberships and parent link fresh from the DB (never the session cache). */
export async function loadProfileStatus(userId: string): Promise<ProfileStatus | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  const orgs = await db
    .select({ role: userOrganizations.role })
    .from(userOrganizations)
    .where(eq(userOrganizations.userId, userId));
  const [link] = await db
    .select({ id: parentAthleteLinks.id })
    .from(parentAthleteLinks)
    .where(and(eq(parentAthleteLinks.parentUserId, userId), eq(parentAthleteLinks.isActive, true)))
    .limit(1);
  return { missing: getMissingProfileFields(user, orgs, !!link), coppaStatus: user.coppaStatus };
}
