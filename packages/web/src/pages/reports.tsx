import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useDeleteReport } from "@/hooks/use-reports";
import { useReportFilters } from "@/hooks/use-report-filters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { ReportWizard } from "@/components/reports/ReportWizard";
import { ReportsFilterBar } from "@/components/reports/ReportsFilterBar";
import { PinnedReportsSection } from "@/components/reports/PinnedReportsSection";
import { RecentReportsSection } from "@/components/reports/RecentReportsSection";
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
import type { Report } from "@shared/schema";

export default function Reports() {
  const { user, organizationContext } = useAuth();
  const [, setLocation] = useLocation();
  const [showWizard, setShowWizard] = useState(false);
  const [deleteReportId, setDeleteReportId] = useState<string | null>(null);

  const { filters, updateFilters, resetFilters, activeFilterCount } = useReportFilters();
  const deleteReport = useDeleteReport();

  // Check access
  if (!user) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p>You must be logged in to view reports.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Only coaches and admins can create reports
  const canCreateReports = user.isSiteAdmin || user.role === "coach" || user.role === "org_admin";

  const handleViewReport = (report: Report) => {
    setLocation(`/reports/${report.id}`);
  };

  const handleDeleteReport = async () => {
    if (deleteReportId) {
      await deleteReport.mutateAsync(deleteReportId);
      setDeleteReportId(null);
    }
  };

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Reports</h1>
          <p className="text-muted-foreground mt-1">
            Create and manage coach and individual reports
          </p>
        </div>
        {canCreateReports && (
          <Button onClick={() => setShowWizard(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Report
          </Button>
        )}
      </div>

      {/* Filter Bar */}
      <ReportsFilterBar
        organizationId={organizationContext || undefined}
        filters={filters}
        updateFilters={updateFilters}
        resetFilters={resetFilters}
        activeFilterCount={activeFilterCount}
      />

      {/* Pinned Reports Section */}
      <PinnedReportsSection
        organizationId={organizationContext || undefined}
        onReportClick={handleViewReport}
      />

      {/* Recent Reports Section */}
      <RecentReportsSection
        organizationId={organizationContext || undefined}
        filters={filters}
        onReportClick={handleViewReport}
      />

      {showWizard && (
        <ReportWizard
          open={showWizard}
          onClose={() => setShowWizard(false)}
          onSuccess={(reportId) => {
            setShowWizard(false);
            // Handle batch reports (array of IDs) vs single report
            if (Array.isArray(reportId)) {
              setLocation(`/reports/multi?ids=${reportId.join(',')}`);
            } else {
              setLocation(`/reports/${reportId}`);
            }
          }}
        />
      )}

      <AlertDialog open={!!deleteReportId} onOpenChange={() => setDeleteReportId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Report</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this report? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteReport}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
