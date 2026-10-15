import type { EnhancedUser, UserOrganization } from "./types/user";
import { hasPermission, type Permission } from "@shared/role-types";

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
 * Whether the user holds the permission in at least one organization (site admins always do),
 * for UI with no specific organization in scope, such as app-wide shortcuts. Asks each
 * membership's role directly: roles are not a ladder (a parent has permissions a coach lacks).
 * False with no memberships, or before they have loaded. The API still checks each row's org.
 */
export function anyOrgGrants(user: RoleUser, userOrganizations: Memberships, permission: Permission): boolean {
  if (!user) return false;
  if (user.isSiteAdmin) return true;
  return (userOrganizations ?? []).some(({ role }) => hasPermission(role, permission));
}
