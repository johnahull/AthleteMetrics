import { isPlaceholderEmail } from '@shared/email-utils';

export type MissingProfileField = 'birthDate' | 'email';

/**
 * Fields an athlete must still supply. Pure; see profile-status.ts for the DB loader.
 * Athlete = not a site admin AND (any org membership is `athlete`, OR no orgs and no active parent link).
 * Uses ANY org, not the alphabetically-first one that session.user.role reflects.
 */
export function getMissingProfileFields(
  user: { isSiteAdmin?: boolean | null; birthDate?: string | null; emails?: string[] | null },
  orgs: { role: string }[],
  hasActiveParentLink: boolean,
): MissingProfileField[] {
  if (user.isSiteAdmin) return [];
  const isAthlete = orgs.length > 0 ? orgs.some((o) => o.role === 'athlete') : !hasActiveParentLink;
  if (!isAthlete) return [];

  const missing: MissingProfileField[] = [];
  if (!user.birthDate) missing.push('birthDate');
  if (!(user.emails ?? []).some((e) => !isPlaceholderEmail(e))) missing.push('email');
  return missing;
}
