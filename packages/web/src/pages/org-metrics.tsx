/**
 * Organization Metrics Page
 *
 * Unified metrics configuration for org admins:
 * - Site metrics enable/disable per organization
 * - Custom org-specific metrics (if customMetricsEnabled)
 * - Derived metrics recalculation
 */

import { useParams, Redirect } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Calculator, RefreshCw, Loader2, AlertCircle, Ruler, Settings2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useOrganization } from "@/lib/organization-api";
import OrganizationMetricsCard from "@/components/organization-metrics-card";
import { CustomOrgMetricList } from "@/components/custom-metrics";
import { useToast } from "@/hooks/use-toast";
import { useConfirmation } from "@/components/ui/confirmation-dialog";
import { apiRequest } from "@/lib/queryClient";

export default function OrgMetricsPage() {
  const { id: organizationId } = useParams();
  const { user, userOrganizations, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { confirm, ConfirmationComponent } = useConfirmation();
  const queryClient = useQueryClient();

  // Fetch organization data to check customMetricsEnabled
  const { data: organization, isLoading: orgLoading } = useOrganization(organizationId);

  // Recalculate derived metrics mutation
  const recalculateDerivedMetricsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/organizations/${organizationId}/recalculate-derived-metrics`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to recalculate derived metrics");
      }
      return res.json();
    },
    onSuccess: (data) => {
      // Invalidate measurements queries to show updated values
      queryClient.invalidateQueries({ queryKey: ['/api/measurements'] });
      queryClient.invalidateQueries({ queryKey: ['measurements'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });

      toast({
        title: "Derived Metrics Recalculated",
        description: `Successfully recalculated ${data.recalculated || 0} derived measurements.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Recalculation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle recalculate with confirmation
  const handleRecalculateDerivedMetrics = () => {
    confirm({
      title: "Recalculate Derived Metrics",
      description: "This will recalculate all derived metrics for your organization's athletes. This may take a few moments. Are you sure you want to continue?",
      confirmText: "Recalculate",
      onConfirm: () => recalculateDerivedMetricsMutation.mutate(),
    });
  };

  // Loading state
  if (authLoading || orgLoading) {
    return <LoadingSpinner text="Loading metrics configuration..." />;
  }

  // Check access - must be site admin or org admin for this org
  const hasAccess = user?.isSiteAdmin ||
    userOrganizations?.some(o =>
      o.organizationId === organizationId && o.role === 'org_admin'
    );

  if (!hasAccess) {
    return <Redirect to="/" />;
  }

  if (!organizationId) {
    return <LoadingSpinner text="Loading..." />;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Settings2 className="h-8 w-8" />
          Metrics Configuration
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage which metrics are available for your organization
        </p>
      </div>

      {/* Site Metrics Configuration */}
      <OrganizationMetricsCard
        organizationId={organizationId}
        canEdit={true}
      />

      {/* Custom Metrics Section - only if enabled */}
      {organization?.customMetricsEnabled && (
        <>
          <Separator className="my-6" />
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2 mb-4">
              <Ruler className="h-6 w-6" />
              Custom Metrics
            </h2>
            <CustomOrgMetricList organizationId={organizationId} embedded />
          </div>
        </>
      )}

      {/* Feature disabled notice */}
      {organization && !organization.customMetricsEnabled && (
        <>
          <Separator className="my-6" />
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-muted-foreground">
                <Ruler className="h-5 w-5" />
                Custom Metrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Custom metrics are not enabled for this organization. Contact a site administrator to enable this feature.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </>
      )}

      <Separator className="my-6" />

      {/* Derived Metrics Recalculation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Derived Metrics Recalculation
          </CardTitle>
          <CardDescription>
            Recalculate all derived metrics for your organization's athletes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              This will recalculate all derived metrics (e.g., speed calculations, power metrics) for athletes in your organization.
              Use this after fixing data issues or when derived values appear incorrect.
            </AlertDescription>
          </Alert>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex-1">
              <h4 className="text-sm font-medium">Recalculate All Derived Metrics</h4>
              <p className="text-sm text-muted-foreground mt-1">
                This will update all calculated measurements based on the latest source data
              </p>
            </div>
            <Button
              onClick={handleRecalculateDerivedMetrics}
              disabled={recalculateDerivedMetricsMutation.isPending}
              variant="outline"
            >
              {recalculateDerivedMetricsMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Recalculating...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Recalculate
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      {ConfirmationComponent}
    </div>
  );
}
