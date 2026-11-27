/**
 * Who may accept an invitation that resolves to an existing account.
 *
 * Holding an invitation link proves nothing about who owns an existing account (the inviter may have
 * seen the link), so an existing account is joined only by its owner signed in as that account. The
 * one exception is an unclaimed account a coach created (pending placeholder password, no OAuth
 * identity) that belongs to no organization but the inviting one: the invitee claims it by choosing
 * a username and password. A site admin account is never reached through an invitation.
 */
import type { User } from "@shared/schema";
import { isPasswordPending } from "../auth/pending-password";

export type InvitationAccountCode = "SIGN_IN_REQUIRED" | "WRONG_ACCOUNT" | "ACCOUNT_NOT_ELIGIBLE" | "ALREADY_MEMBER";

export class InvitationAccountError extends Error {
  constructor(public readonly code: InvitationAccountCode) {
    super(
      code === "SIGN_IN_REQUIRED"
        ? "An account already exists for this invitation. Please sign in to accept it."
        : code === "WRONG_ACCOUNT"
          ? "This invitation is for a different account. Please sign out and sign in as the invited account."
          : code === "ALREADY_MEMBER"
            ? "You are already a member of this organization. Please contact your organization to change your role."
            : "This invitation cannot be accepted for this account. Please contact your organization."
    );
    this.name = "InvitationAccountError";
  }

  get status(): number {
    return this.code === "SIGN_IN_REQUIRED" ? 401 : this.code === "ALREADY_MEMBER" ? 409 : 403;
  }
}

type AccountFields = Pick<User, "password" | "googleId" | "appleId" | "isSiteAdmin">;

/**
 * Created by a coach and never signed into: pending placeholder password (as is, or the bcrypt hash older
 * rows hold; see auth/pending-password) and no OAuth identity.
 */
export async function isUnclaimedAccount(user: AccountFields): Promise<boolean> {
  if (user.googleId || user.appleId) return false;
  return isPasswordPending(user.password);
}

/** The invitation fields the rule depends on. playerId is the linked athlete, or the CHILD for a parent invitation. */
export type InvitationTarget = { organizationId: string; role: string; playerId?: string | null };

/**
 * Whether anyone holding the link (not signed in as the account) may claim it: an unclaimed account
 * that belongs to the inviting organization and to no other one. A parent invitation never claims an
 * account (an unclaimed account in the organization is an athlete row, e.g. the child or a sibling
 * sharing a family email).
 */
export async function canClaimThroughInvitation(
  user: AccountFields,
  memberOrganizationIds: string[],
  invitation: InvitationTarget,
): Promise<boolean> {
  return user.isSiteAdmin !== true
    && invitation.role !== "parent"
    && memberOrganizationIds.includes(invitation.organizationId)
    && memberOrganizationIds.every(id => id === invitation.organizationId)
    && await isUnclaimedAccount(user);
}

/**
 * Throws unless `actingUserId` (the signed-in user, if any) may accept for `target`.
 * Returns true when the acceptance claims the account (sets its credentials).
 */
export async function assertMayAcceptFor(
  target: AccountFields & { id: string; isActive?: boolean | null },
  memberOrganizationIds: string[],
  invitation: InvitationTarget,
  actingUserId: string | undefined,
): Promise<{ claim: boolean }> {
  if (target.isSiteAdmin === true) throw new InvitationAccountError("ACCOUNT_NOT_ELIGIBLE");
  // A child cannot become their own parent
  if (invitation.role === "parent" && target.id === invitation.playerId) {
    throw new InvitationAccountError("ACCOUNT_NOT_ELIGIBLE");
  }
  if (actingUserId === target.id) {
    // A deactivated account may still hold a session opened before the deactivation
    if (target.isActive === false) throw new InvitationAccountError("ACCOUNT_NOT_ELIGIBLE");
    // Accepting never changes an existing membership's role. A parent invitation keeps the membership as is
    // (storage.acceptInvitation) and only links the child.
    if (invitation.role !== "parent" && memberOrganizationIds.includes(invitation.organizationId)) {
      throw new InvitationAccountError("ALREADY_MEMBER");
    }
    return { claim: false };
  }
  // shortcut: a pending athlete row (createAthlete stores isActive false until claimed) cannot be told apart from an
  // admin-deactivated one that still has the placeholder (there is no deactivation field), so isActive is not checked
  // when claiming; such an account is reactivated by its claim. Add a deactivation marker to tell them apart.
  if (await canClaimThroughInvitation(target, memberOrganizationIds, invitation)) return { claim: true };
  throw new InvitationAccountError(actingUserId ? "WRONG_ACCOUNT" : "SIGN_IN_REQUIRED");
}
