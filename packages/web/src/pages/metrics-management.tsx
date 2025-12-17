import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { Plus, Edit, Trash2, Power, PowerOff } from "lucide-react";
import {
  useSiteMetrics,
  useDeleteSiteMetric,
  useToggleSiteMetricStatus,
} from "@/lib/metrics-api";
import { useSports } from "@/lib/sports-api";
import type { SiteMetric } from "@shared/schema";
import MetricFormDialog from "@/components/metric-form-dialog";

export default function MetricsManagementPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedMetric, setSelectedMetric] = useState<SiteMetric | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [toggleDialogOpen, setToggleDialogOpen] = useState(false);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [metricToEdit, setMetricToEdit] = useState<SiteMetric | null>(null);

  // Redirect if not site admin
  if (!user?.isSiteAdmin) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Only site administrators can manage metrics.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { data: metrics, isLoading } = useSiteMetrics(true); // Include inactive
  const { data: sports } = useSports();
  const deleteMetricMutation = useDeleteSiteMetric();
  const toggleStatusMutation = useToggleSiteMetricStatus();

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
        <Badge variant="outline" className="bg-gray-50">
          All Sports
        </Badge>
      );
    }

    const visibleSports = sportCodes.slice(0, 3);
    const remainingCount = sportCodes.length - 3;

    return (
      <div className="flex gap-1 flex-wrap items-center">
        {visibleSports.map((code) => (
          <Badge key={code} variant="outline" className="bg-blue-50 text-blue-700">
            {getSportName(code)}
          </Badge>
        ))}
        {remainingCount > 0 && (
          <Badge variant="outline" className="bg-gray-50 text-gray-600">
            +{remainingCount} more
          </Badge>
        )}
      </div>
    );
  }, [getSportName]);

  const handleDelete = async () => {
    if (!selectedMetric) return;

    try {
      await deleteMetricMutation.mutateAsync(selectedMetric.code);
      toast({
        title: "Metric deleted",
        description: `${selectedMetric.label} has been deleted successfully.`,
      });
      setDeleteDialogOpen(false);
      setSelectedMetric(null);
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Failed to delete metric",
        variant: "destructive",
      });
    }
  };

  const handleToggleStatus = async () => {
    if (!selectedMetric) return;

    try {
      await toggleStatusMutation.mutateAsync({
        code: selectedMetric.code,
        isActive: !selectedMetric.isActive,
      });
      toast({
        title: selectedMetric.isActive ? "Metric disabled" : "Metric enabled",
        description: `${selectedMetric.label} has been ${selectedMetric.isActive ? 'disabled' : 'enabled'}.`,
      });
      setToggleDialogOpen(false);
      setSelectedMetric(null);
    } catch (error) {
      toast({
        title: "Toggle failed",
        description: error instanceof Error ? error.message : "Failed to toggle metric status",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Metrics Management</h1>
          <p className="text-muted-foreground mt-1">
            Manage the catalog of available metrics for all organizations
          </p>
        </div>
        <Button
          data-testid="add-metric-button"
          onClick={() => {
            setMetricToEdit(null);
            setFormDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Metric
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Site Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading metrics...</div>
          ) : !metrics || metrics.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No metrics found. Create your first metric to get started.
            </div>
          ) : (
            <Table data-testid="metrics-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Sports</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.map((metric) => (
                  <TableRow key={metric.code} data-testid={`metric-row-${metric.code}`}>
                    <TableCell className="font-mono text-sm">{metric.code}</TableCell>
                    <TableCell className="font-medium">{metric.label}</TableCell>
                    <TableCell>
                      {metric.category && (
                        <Badge variant="outline">{metric.category}</Badge>
                      )}
                    </TableCell>
                    <TableCell>{metric.unit || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={
                        metric.metricType === 'lower_is_better' ? "default" :
                        metric.metricType === 'higher_is_better' ? "secondary" :
                        "outline"
                      }>
                        {metric.metricType === 'lower_is_better' ? 'Lower is better' :
                         metric.metricType === 'higher_is_better' ? 'Higher is better' :
                         'Tracking'}
                      </Badge>
                    </TableCell>
                    <TableCell data-testid="sports-cell">
                      {renderSportBadges(metric.sportAssociations)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {metric.isSystemDefault && (
                          <Badge variant="outline">System Default</Badge>
                        )}
                        {metric.isActive ? (
                          <Badge>Active</Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`edit-metric-${metric.code}`}
                          onClick={() => {
                            setMetricToEdit(metric);
                            setFormDialogOpen(true);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`toggle-metric-${metric.code}`}
                          onClick={() => {
                            setSelectedMetric(metric);
                            setToggleDialogOpen(true);
                          }}
                        >
                          {metric.isActive ? (
                            <PowerOff className="h-4 w-4" />
                          ) : (
                            <Power className="h-4 w-4" />
                          )}
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`delete-metric-${metric.code}`}
                          disabled={metric.isSystemDefault}
                          onClick={() => {
                            setSelectedMetric(metric);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Metric</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{selectedMetric?.label}</strong>?
              <br />
              <br />
              This action cannot be undone. The metric will only be deleted if no
              measurements exist for it. If measurements exist, you should disable
              the metric instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              data-testid="confirm-delete"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Toggle Status Confirmation Dialog */}
      <AlertDialog open={toggleDialogOpen} onOpenChange={setToggleDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectedMetric?.isActive ? 'Disable' : 'Enable'} Metric
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedMetric?.isActive ? (
                <>
                  Are you sure you want to disable <strong>{selectedMetric?.label}</strong>?
                  <br />
                  <br />
                  This will hide the metric from all organizations, but measurement data
                  will be preserved. You can re-enable it later.
                </>
              ) : (
                <>
                  Are you sure you want to enable <strong>{selectedMetric?.label}</strong>?
                  <br />
                  <br />
                  This will make the metric available for organizations to opt-in.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggleStatus}
              data-testid={selectedMetric?.isActive ? "confirm-disable" : "confirm-enable"}
            >
              {selectedMetric?.isActive ? 'Disable' : 'Enable'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Metric Form Dialog */}
      <MetricFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        metric={metricToEdit}
      />
    </div>
  );
}
