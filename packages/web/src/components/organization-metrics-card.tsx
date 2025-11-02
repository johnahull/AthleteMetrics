import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Settings, Save, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useSiteMetrics,
  useOrganizationMetrics,
  useEnableMetricForOrganization,
  useDisableMetricForOrganization,
  useUpdateOrganizationMetric,
} from "@/lib/metrics-api";
import type { SiteMetric, OrganizationMetric } from "@shared/schema";

interface OrganizationMetricsCardProps {
  organizationId: string;
  canEdit: boolean; // Whether current user can modify org settings
}

export default function OrganizationMetricsCard({
  organizationId,
  canEdit,
}: OrganizationMetricsCardProps) {
  const { toast } = useToast();
  const [editingMetric, setEditingMetric] = useState<string | null>(null);
  const [customLabel, setCustomLabel] = useState("");

  // Show debug info on mount
  useEffect(() => {
    toast({
      title: "Debug: Metrics Card Loaded",
      description: `canEdit: ${canEdit}, orgId: ${organizationId.substring(0, 8)}...`,
      duration: 5000,
    });
  }, []);

  // Fetch all site metrics (active only)
  const { data: siteMetrics, isLoading: loadingSite } = useSiteMetrics(false);

  // Fetch organization metrics
  const { data: orgMetrics, isLoading: loadingOrg } = useOrganizationMetrics(
    organizationId,
    false
  );

  const enableMutation = useEnableMetricForOrganization();
  const disableMutation = useDisableMetricForOrganization();
  const updateMutation = useUpdateOrganizationMetric();

  const isLoading = loadingSite || loadingOrg;

  // Debug logging for toggle disabled state
  console.log('[MetricsCard] State:', {
    canEdit,
    enablePending: enableMutation.isPending,
    disablePending: disableMutation.isPending,
    organizationId
  });

  // Get org metric data for a given site metric code
  const getOrgMetric = (code: string): OrganizationMetric | undefined => {
    return orgMetrics?.find((om) => om.metricCode === code);
  };

  // Check if metric is enabled for org
  const isMetricEnabled = (code: string): boolean => {
    const orgMetric = getOrgMetric(code);
    return orgMetric?.isEnabled ?? false;
  };

  // Get custom label if set
  const getCustomLabel = (code: string): string | undefined => {
    const orgMetric = getOrgMetric(code);
    return orgMetric?.customLabel ?? undefined;
  };

  const handleToggle = async (metric: SiteMetric, enabled: boolean) => {
    console.log('[MetricsCard] Toggle clicked:', {
      metric: metric.code,
      enabled,
      canEdit,
      enablePending: enableMutation.isPending,
      disablePending: disableMutation.isPending
    });

    // Visible toast to show click was detected
    toast({
      title: "Toggle Clicked",
      description: `Metric: ${metric.code}, Action: ${enabled ? 'Enable' : 'Disable'}`,
      duration: 2000,
    });

    if (!canEdit) {
      console.log('[MetricsCard] Toggle blocked: canEdit is false');
      return;
    }

    try {
      if (enabled) {
        console.log('[MetricsCard] Enabling metric:', metric.code);
        const result = await enableMutation.mutateAsync({
          organizationId,
          metricCode: metric.code,
        });
        console.log('[MetricsCard] Enable success:', result);
        toast({
          title: "Metric enabled",
          description: `${metric.label} is now available for your organization.`,
        });
      } else {
        console.log('[MetricsCard] Disabling metric:', metric.code);
        const result = await disableMutation.mutateAsync({
          organizationId,
          metricCode: metric.code,
        });
        console.log('[MetricsCard] Disable success:', result);
        toast({
          title: "Metric disabled",
          description: `${metric.label} has been disabled for your organization.`,
        });
      }
    } catch (error) {
      console.error('[MetricsCard] Toggle error:', error);
      console.error('[MetricsCard] Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        raw: error
      });
      toast({
        title: "Failed to update metric",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      console.log('[MetricsCard] Toggle complete - mutation states:', {
        enablePending: enableMutation.isPending,
        disablePending: disableMutation.isPending
      });
    }
  };

  const handleStartEdit = (code: string) => {
    if (!canEdit) return;
    setEditingMetric(code);
    setCustomLabel(getCustomLabel(code) || "");
  };

  const handleCancelEdit = () => {
    setEditingMetric(null);
    setCustomLabel("");
  };

  const handleSaveCustomLabel = async (metricCode: string) => {
    if (!canEdit) return;

    try {
      await updateMutation.mutateAsync({
        organizationId,
        metricCode,
        data: {
          customLabel: customLabel.trim() || undefined,
        },
      });
      toast({
        title: "Custom label saved",
        description: customLabel.trim()
          ? `Custom label "${customLabel}" applied.`
          : "Custom label removed.",
      });
      setEditingMetric(null);
      setCustomLabel("");
    } catch (error) {
      toast({
        title: "Failed to save custom label",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Metrics Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            Loading metrics...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!siteMetrics || siteMetrics.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Metrics Configuration
          </CardTitle>
          <CardDescription>
            Configure which metrics are available for your organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            No metrics available yet.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="organization-metrics-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Metrics Configuration
        </CardTitle>
        <CardDescription>
          Enable metrics for your organization and customize display labels
        </CardDescription>
        {/* Debug info */}
        <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs flex items-center justify-between">
          <div>
            <strong>Debug:</strong> canEdit={String(canEdit)}, enablePending={String(enableMutation.isPending)}, disablePending={String(disableMutation.isPending)}
          </div>
          {(enableMutation.isPending || disableMutation.isPending) && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                enableMutation.reset();
                disableMutation.reset();
                toast({ title: "Mutations reset", description: "Toggles should work now" });
              }}
            >
              Reset Stuck Mutations
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Custom Label</TableHead>
              <TableHead className="text-right">Enabled</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {siteMetrics.map((metric) => {
              const isEnabled = isMetricEnabled(metric.code);
              const customLabelValue = getCustomLabel(metric.code);
              const isEditing = editingMetric === metric.code;
              const isToggleDisabled = !canEdit || enableMutation.isPending || disableMutation.isPending;

              // Debug logging per metric
              if (metric.code === 'DASH_10YD') {
                console.log('[MetricsCard] DASH_10YD toggle state:', {
                  isEnabled,
                  isToggleDisabled,
                  canEdit,
                  enablePending: enableMutation.isPending,
                  disablePending: disableMutation.isPending,
                  isSystemDefault: metric.isSystemDefault
                });
              }

              return (
                <TableRow
                  key={metric.code}
                  data-testid={`org-metric-row-${metric.code}`}
                >
                  <TableCell className="font-medium">
                    {metric.label}
                    {metric.isSystemDefault && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        Default
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {metric.category ? (
                      <Badge variant="outline">{metric.category}</Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {metric.unit || <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <div className="flex gap-2 items-center">
                        <Input
                          value={customLabel}
                          onChange={(e) => setCustomLabel(e.target.value)}
                          placeholder={metric.label}
                          className="max-w-xs"
                          data-testid={`custom-label-input-${metric.code}`}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleSaveCustomLabel(metric.code)}
                          disabled={updateMutation.isPending}
                          data-testid={`save-custom-label-${metric.code}`}
                        >
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleCancelEdit}
                          data-testid={`cancel-custom-label-${metric.code}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleStartEdit(metric.code)}
                        className="text-left hover:underline"
                        disabled={!canEdit || !isEnabled}
                        data-testid={`edit-custom-label-${metric.code}`}
                      >
                        {customLabelValue || (
                          <span className="text-muted-foreground italic">
                            {canEdit && isEnabled ? "Set custom label..." : "-"}
                          </span>
                        )}
                      </button>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={(checked) => handleToggle(metric, checked)}
                        disabled={isToggleDisabled}
                        data-testid={`toggle-metric-${metric.code}`}
                      />
                      <span className="text-xs" style={{ color: isToggleDisabled ? 'red' : 'green' }}>
                        [{isToggleDisabled ? 'DIS' : 'EN'}]
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
