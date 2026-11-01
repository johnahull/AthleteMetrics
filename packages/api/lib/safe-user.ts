/**
 * Response-boundary allowlists for users and invitations.
 *
 * Server code reads whole `users` / `invitations` rows (it needs the password hash, MFA secret,
 * invitation token ...), but those rows must never be serialised to a client as-is. Anything that
 * answers an HTTP request with a user or an invitation goes through these helpers, which are
 * ALLOWLISTS: a column added to the table later is hidden until someone adds it here.
 */

import type { Invitation, User } from "@shared/schema";

/** What any member of an organization may see about another member. */
const MEMBER_VISIBLE_USER_KEYS: ReadonlyArray<keyof User> = [
  "id",
  "username", // shown as the public @handle on profile pages
  "firstName",
  "lastName",
  "fullName",
  "school",
  "graduationYear",
  "sports",
  "positions",
  "gender",
  "isActive",
];

/**
 * What staff (coach, org admin, site admin) and the user themself may see. Still no password,
 * MFA secret, backup codes, lock state, OAuth ids, parent email or consent internals.
 */
const STAFF_VISIBLE_USER_KEYS: ReadonlyArray<keyof User> = [
  ...MEMBER_VISIBLE_USER_KEYS,
  "emails",
  "birthDate",
  "birthYear", // for a minor this reveals that they are underage, so staff only
  "phoneNumbers",
  "height",
  "weight",
  "mfaEnabled",
  "lastLoginAt",
  "isEmailVerified",
  "isSiteAdmin",
  "isMinor",
  "coppaStatus",
  "createdAt",
];

/** Extra fields only the account owner gets back about themself (still never a secret). */
const SELF_ONLY_USER_KEYS: ReadonlyArray<keyof User> = [
  "parentEmail",
  "hasCompletedOnboarding",
  "showPeerComparisons",
  "requiresPasswordChange",
];

export type UserVisibility = "self" | "staff" | "member";

export type SafeUser = Partial<User>;

/** Copy only the allowlisted keys that exist on the row. */
export function toSafeUser(user: User | Partial<User>, visibility: UserVisibility): SafeUser {
  const keys =
    visibility === "self"
      ? [...STAFF_VISIBLE_USER_KEYS, ...SELF_ONLY_USER_KEYS]
      : visibility === "staff"
        ? STAFF_VISIBLE_USER_KEYS
        : MEMBER_VISIBLE_USER_KEYS;
  const out: SafeUser = {};
  for (const key of keys) {
    if (key in user) (out as Record<string, unknown>)[key] = (user as Record<string, unknown>)[key];
  }
  return out;
}

/** Staff of an organization (and site admins) see more of a member than a fellow member does. */
export function visibilityForRole(role: string | undefined, isSiteAdmin: boolean): UserVisibility {
  return isSiteAdmin || role === "org_admin" || role === "coach" ? "staff" : "member";
}

/**
 * Who may see (and copy the link of) an invitation: site admins and the organization's admins
 * for every invitation, coaches for athlete invitations only, nobody else.
 */
export function canManageInvitation(
  roleInOrganization: string | undefined,
  isSiteAdmin: boolean,
  invitationRole: string,
): boolean {
  if (isSiteAdmin || roleInOrganization === "org_admin") return true;
  return roleInOrganization === "coach" && invitationRole === "athlete";
}

/** The invitations a viewer may see in one organization; others get an empty list. */
export function invitationsVisibleTo<T extends Pick<Invitation, "role">>(
  invitations: T[],
  roleInOrganization: string | undefined,
  isSiteAdmin: boolean,
): T[] {
  return invitations.filter((inv) => canManageInvitation(roleInOrganization, isSiteAdmin, inv.role));
}

/**
 * Contact and age details a fellow member must not get about teammates. `birthYear` counts as age: for a minor
 * it tells any org member that they are underage (the member tier of `toSafeUser` leaves it out for the same reason).
 */
const PRIVATE_MEMBER_DETAIL_KEYS = ["emails", "birthDate", "birthYear", "phoneNumbers", "height", "weight"] as const;

/**
 * For roster rows that are already column projections (not whole users): drop contact and age details
 * when the viewer is a plain member rather than staff.
 */
export function withoutPrivateMemberDetails<T extends Record<string, unknown>>(row: T): Omit<T, (typeof PRIVATE_MEMBER_DETAIL_KEYS)[number]> {
  const copy: Record<string, unknown> = { ...row };
  for (const key of PRIVATE_MEMBER_DETAIL_KEYS) delete copy[key];
  return copy as Omit<T, (typeof PRIVATE_MEMBER_DETAIL_KEYS)[number]>;
}
