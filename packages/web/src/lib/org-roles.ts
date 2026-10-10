import type { EnhancedUser, UserOrganization } from "./types/user";
import { ROLE_HIERARCHY } from "@shared/role-types";

/** A user's role as far as one organization (or the whole app, for site admins) is concerned. */
export type OrgRole = "site_admin" | UserOrganization["role"];

type RoleUser = Pick<EnhancedUser, "isSiteAdmin"> | null | undefined;
type Memberships = Pick<UserOrganization, "organizationId" | "role">[] | null | undefined;

/**
 * The user's role in ONE organization, mirroring the API's getOrgRole: 'site_admin' for a
 * site admin, the member's role there, undefined for a non-member or no organization.
 * Never the session role (`user.role`), which is the role in the alphabetically-first org.
 */
export function getOrgRole(
  user: RoleUser,
  userOrganizations: Memberships,
  organizationId: string | null | undefined
): OrgRole | undefined {
  if (!user) return undefined;
  if (user.isSiteAdmin) return "site_admin";
  if (!organizationId) return undefined;
  return userOrganizations?.find((org) => org.organizationId === organizationId)?.role;
}

/**
 * The user's highest role across all their memberships ('site_admin' for a site admin),
 * for UI with no specific organization in scope, such as app-wide shortcuts. Undefined with
 * no memberships, or before they have loaded. The API still checks each row's organization.
 */
export function getHighestOrgRole(user: RoleUser, userOrganizations: Memberships): OrgRole | undefined {
  if (!user) return undefined;
  if (user.isSiteAdmin) return "site_admin";
  let highest: OrgRole | undefined;
  for (const { role } of userOrganizations ?? []) {
    if (!highest || ROLE_HIERARCHY[role] > ROLE_HIERARCHY[highest]) highest = role;
  }
  return highest;
}
