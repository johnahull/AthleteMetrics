import { useAuth } from "@/lib/auth";

/** Organization the report-template pages work in: the chosen one, else a member's first. */
export function useTemplateOrganizationId(): string | null {
  const { organizationContext, userOrganizations, user } = useAuth();
  return (
    organizationContext ||
    (!user?.isSiteAdmin && Array.isArray(userOrganizations) && userOrganizations.length > 0 ? userOrganizations[0].organizationId : null)
  );
}
