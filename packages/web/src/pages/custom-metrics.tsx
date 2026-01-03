import { useParams, Redirect } from "wouter";
import { CustomOrgMetricList } from "@/components/custom-metrics";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useAuth } from "@/lib/auth";

export default function CustomMetricsPage() {
  const { id } = useParams();
  const { user, userOrganizations, isLoading } = useAuth();

  if (!id) {
    return <LoadingSpinner text="Loading custom metrics..." />;
  }

  // Wait for auth to load
  if (isLoading) {
    return <LoadingSpinner text="Loading..." />;
  }

  // Check if user has access (site admin or org admin for this org)
  const hasAccess = user?.isSiteAdmin ||
    userOrganizations?.some(o =>
      o.organizationId === id && o.role === 'org_admin'
    );

  if (!hasAccess) {
    return <Redirect to="/" />;
  }

  return <CustomOrgMetricList organizationId={id} />;
}
