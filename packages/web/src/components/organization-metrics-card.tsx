import { useState, useMemo, useCallback } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Settings, Save, X, Filter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useSiteMetrics,
  useOrganizationMetrics,
  useEnableMetricForOrganization,
  useDisableMetricForOrganization,
  useUpdateOrganizationMetric,
} from "@/lib/metrics-api";
import { useSports } from "@/lib/sports-api";
import type { SiteMetric, OrganizationMetric } from "@shared/schema";

// Maximum number of sport badges to display before showing "+N more"
const MAX_VISIBLE_SPORT_BADGES = 3;

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
  const [selectedSport, setSelectedSport] = useState<string>("ALL");

  // Fetch all site metrics (active only)
  // Pass organizationId to allow org admins to access metrics via /api/metrics endpoint
  const { data: siteMetrics, isLoading: loadingSite } = useSiteMetrics(false, organizationId);

  // Fetch organization metrics
  const { data: orgMetrics, isLoading: loadingOrg } = useOrganizationMetrics(
    organizationId,
    false
  );

  // Fetch sports for filter dropdown
  const { data: sports } = useSports();

  const enableMutation = useEnableMetricForOrganization();
  const disableMutation = useDisableMetricForOrganization();
  const updateMutation = useUpdateOrganizationMetric();

  const isLoading = loadingSite || loadingOrg;

  // Filter metrics by selected sport
  const filteredMetrics = useMemo(() => {
    if (!siteMetrics) return [];
    if (selectedSport === "ALL") return siteMetrics;

    // Show metrics tagged with selected sport OR metrics with no tags (general metrics)
    return siteMetrics.filter((metric) => {
      const sportAssociations = metric.sportAssociations;

      // If no sport associations, it's a general metric (show in all filters)
      if (!sportAssociations || sportAssociations.length === 0) {
        return true;
      }

      // Otherwise, check if selected sport is in the associations
      return sportAssociations.includes(selectedSport);
    });
  }, [siteMetrics, selectedSport]);

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

  // Memoized sport name lookup map for performance
  const sportNameMap = useMemo(() => {
    return new Map(sports?.map(s => [s.code, s.name]) || []);
  }, [sports]);

  // Helper to get sport name from code
  const getSportName = useCallback((code: string): string => {
    return sportNameMap.get(code) || code;
  }, [sportNameMap]);

  // Helper to render sport badges
  const renderSportBadges = useCallback((sportCodes: string[] | null | undefined) => {
    if (!sportCodes || sportCodes.length === 0) {
      return (
        <Badge variant="outline" className="bg-gray-50 text-gray-600">
          All Sports
        </Badge>
      );
    }

    const visibleSports = sportCodes.slice(0, MAX_VISIBLE_SPORT_BADGES);
    const remainingCount = sportCodes.length - MAX_VISIBLE_SPORT_BADGES;

    return (
      <div className="flex gap-1 flex-wrap items-center">
        {visibleSports.map((code) => (
          <Badge key={code} variant="outline" className="bg-blue-50 text-blue-700">
            {getSportName(code)}
          </Badge>
        ))}
        {remainingCount > 0 && (
          <Badge variant="outline" className="bg-gray-50 text-gray-600 text-xs">
            +{remainingCount} more
          </Badge>
        )}
      </div>
    );
  }, [getSportName]);

  const handleToggle = async (metric: SiteMetric, enabled: boolean) => {
    if (!canEdit) return;

    try {
      if (enabled) {
        await enableMutation.mutateAsync({
          organizationId,
          metricCode: metric.code,
        });
        toast({
          title: "Metric enabled",
          description: `${metric.label} is now available for your organization.`,
        });
      } else {
        await disableMutation.mutateAsync({
          organizationId,
          metricCode: metric.code,
        });
        toast({
          title: "Metric disabled",
          description: `${metric.label} has been disabled for your organization.`,
        });
      }
    } catch (error) {
      toast({
        title: "Failed to update metric",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
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
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Metrics Configuration
            </CardTitle>
            <CardDescription>
              Enable metrics for your organization and customize display labels
            </CardDescription>
          </div>

          {/* Sport Filter Dropdown */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedSport} onValueChange={setSelectedSport}>
              <SelectTrigger className="w-[180px]" data-testid="sport-filter-dropdown">
                <SelectValue placeholder="All Sports" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL" data-testid="sport-filter-option-ALL">
                  All Sports
                </SelectItem>
                {sports?.map((sport) => (
                  <SelectItem
                    key={sport.code}
                    value={sport.code}
                    data-testid={`sport-filter-option-${sport.code}`}
                  >
                    {sport.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Sports</TableHead>
              <TableHead>Custom Label</TableHead>
              <TableHead className="text-right">Enabled</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMetrics.map((metric) => {
              const isEnabled = isMetricEnabled(metric.code);
              const customLabelValue = getCustomLabel(metric.code);
              const isEditing = editingMetric === metric.code;

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
                  <TableCell data-testid="org-metric-sports-cell">
                    {renderSportBadges(metric.sportAssociations)}
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
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={(checked) => handleToggle(metric, checked)}
                      disabled={!canEdit || enableMutation.isPending || disableMutation.isPending}
                      data-testid={`toggle-metric-${metric.code}`}
                    />
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
