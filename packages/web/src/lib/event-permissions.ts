import type { EnhancedUser, UserOrganization } from "./types/user";

/**
 * Whether the user manages this event (data entry, Movement Quality, clips): a site
 * admin, or an org_admin / coach of the event's organization. Athletes never do
 * (AM-FEAT-015). The API enforces the same rule; this only drives the UI.
 */
export function canManageEvent(
  user: Pick<EnhancedUser, "isSiteAdmin"> | null | undefined,
  userOrganizations: Pick<UserOrganization, "organizationId" | "role">[] | null | undefined,
  event: { organizationId?: string | null } | null | undefined
): boolean {
  if (!event || !user) return false;
  if (user.isSiteAdmin) return true;
  if (!event.organizationId) return false;

  return (
    userOrganizations?.some(
      (org) => org.organizationId === event.organizationId && (org.role === "org_admin" || org.role === "coach")
    ) ?? false
  );
}

/**
 * Whether the user can delete this event: a site admin, or an org_admin of the event's
 * organization. Coaches cannot, and only a site admin can delete an event without an
 * organization. The API enforces the same rule; this only drives the UI.
 */
export function canDeleteEvent(
  user: Pick<EnhancedUser, "isSiteAdmin"> | null | undefined,
  userOrganizations: Pick<UserOrganization, "organizationId" | "role">[] | null | undefined,
  event: { organizationId?: string | null } | null | undefined
): boolean {
  if (!event || !user) return false;
  if (user.isSiteAdmin) return true;
  if (!event.organizationId) return false;

  return (
    userOrganizations?.some((org) => org.organizationId === event.organizationId && org.role === "org_admin") ?? false
  );
}
