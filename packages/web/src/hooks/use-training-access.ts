/**
 * Hook to check if the training module is accessible for the current user's organization.
 * Used by all training pages to enforce the two-level feature flag gate:
 * 1. Global site setting: `siteSettings.trainingModuleEnabled`
 * 2. Per-org setting: `organization.trainingEnabled`
 *
 * Both must be true for training features to be accessible.
 */

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import type { SiteSettings, Organization, UserOrganization } from "@shared/schema";

export interface TrainingAccessResult {
  isEnabled: boolean;
  isLoading: boolean;
  organizationId: string | null;
}

export function useTrainingAccess(): TrainingAccessResult {
  const { user } = useAuth();

  // Fetch user's organizations to get org ID
  const { data: userOrganizations, isLoading: orgsLoading } = useQuery<UserOrganization[]>({
    queryKey: ["/api/auth/me/organizations"],
    enabled: !!user?.id && !user?.isSiteAdmin,
  });

  const organizationId = userOrganizations?.[0]?.organizationId ?? null;

  // Fetch site settings (public endpoint for non-site-admins)
  const siteSettingsEndpoint = user?.isSiteAdmin
    ? "/api/site-settings"
    : "/api/site-settings/public";

  const { data: siteSettings, isLoading: settingsLoading } = useQuery<Pick<SiteSettings, "trainingModuleEnabled">>({
    queryKey: [siteSettingsEndpoint],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch organization to check org-level training status
  const { data: organization, isLoading: orgLoading } = useQuery<Organization>({
    queryKey: [`/api/organizations/${organizationId}`],
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = orgsLoading || settingsLoading || orgLoading;

  const globalEnabled = siteSettings?.trainingModuleEnabled ?? false;
  const orgEnabled = organization?.trainingEnabled ?? false;
  const isEnabled = globalEnabled && orgEnabled;

  return { isEnabled, isLoading, organizationId };
}
