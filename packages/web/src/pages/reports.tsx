import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useDeleteReport, useArchiveReport, useBulkArchiveReports, useBulkDeleteReports } from "@/hooks/use-reports";
import { useReportFilters } from "@/hooks/use-report-filters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, CheckSquare, X, Send, Archive, Trash2 } from "lucide-react";
import { ReportWizard } from "@/components/reports/ReportWizard";
import { ReportsFilterBar } from "@/components/reports/ReportsFilterBar";
import { PinnedReportsSection } from "@/components/reports/PinnedReportsSection";
import { RecentReportsSection } from "@/components/reports/RecentReportsSection";
import { BulkDistributeReportsDialog } from "@/components/reports/BulkDistributeReportsDialog";
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

// Extended report type with sentToAthlete status from API
interface ReportWithSentStatus extends Report {
  targetAthleteName?: string;
  sentToAthlete?: {
    sentAt: string;
    athleteName: string;
  } | null;
}

export default function Reports() {
  const { user, organizationContext } = useAuth();
  const [, setLocation] = useLocation();
  const [showWizard, setShowWizard] = useState(false);
  const [deleteReportId, setDeleteReportId] = useState<string | null>(null);
  const [archiveReportId, setArchiveReportId] = useState<string | null>(null);

  // Selection mode state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedReports, setSelectedReports] = useState<Map<string, ReportWithSentStatus>>(new Map());
  const [showDistributeDialog, setShowDistributeDialog] = useState(false);
  const [showBulkArchiveDialog, setShowBulkArchiveDialog] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  const { filters, updateFilters, resetFilters, activeFilterCount } = useReportFilters();
  const deleteReport = useDeleteReport();
  const archiveReport = useArchiveReport();
  const bulkArchive = useBulkArchiveReports();
  const bulkDelete = useBulkDeleteReports();

  // Selection handlers
  const handleToggleSelection = useCallback((report: ReportWithSentStatus) => {
    setSelectedReports((prev) => {
      const next = new Map(prev);
      if (next.has(report.id)) {
        next.delete(report.id);
      } else {
        next.set(report.id, report);
      }
      return next;
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedReports(new Map());
  }, []);

  const handleExitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedReports(new Map());
  }, []);

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
    // In selection mode, toggle selection instead of navigating
    if (isSelectionMode) {
      handleToggleSelection(report as ReportWithSentStatus);
      return;
    }
    setLocation(`/reports/${report.id}`);
  };

  const handleRequestDelete = (reportId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    setDeleteReportId(reportId);
  };

  const handleDeleteReport = async () => {
    if (deleteReportId) {
      await deleteReport.mutateAsync(deleteReportId);
      setDeleteReportId(null);
    }
  };

  const handleRequestArchive = (reportId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    setArchiveReportId(reportId);
  };

  const handleArchiveReport = async () => {
    if (archiveReportId) {
      await archiveReport.mutateAsync(archiveReportId);
      setArchiveReportId(null);
    }
  };

  const handleBulkArchive = async () => {
    const reportIds = Array.from(selectedReports.keys());
    await bulkArchive.mutateAsync(reportIds);
    setShowBulkArchiveDialog(false);
    handleExitSelectionMode();
  };

  const handleBulkDelete = async () => {
    const reportIds = Array.from(selectedReports.keys());
    await bulkDelete.mutateAsync(reportIds);
    setShowBulkDeleteDialog(false);
    handleExitSelectionMode();
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
        <div className="flex items-center gap-2">
          {/* Selection mode toggle */}
          {canCreateReports && (
            <Button
              variant={isSelectionMode ? "secondary" : "outline"}
              onClick={() => isSelectionMode ? handleExitSelectionMode() : setIsSelectionMode(true)}
              data-testid="toggle-selection-mode"
            >
              <CheckSquare className="h-4 w-4 mr-2" />
              {isSelectionMode ? "Cancel" : "Select"}
            </Button>
          )}
          {canCreateReports && !isSelectionMode && (
            <Button onClick={() => setShowWizard(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Report
            </Button>
          )}
        </div>
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
        onDelete={handleRequestDelete}
        onArchive={handleRequestArchive}
        includeArchived={filters.includeArchived}
        isSelectionMode={isSelectionMode}
        selectedReportIds={new Set(selectedReports.keys())}
        onToggleSelection={handleToggleSelection}
      />

      {/* Recent Reports Section */}
      <RecentReportsSection
        organizationId={organizationContext || undefined}
        filters={filters}
        onReportClick={handleViewReport}
        onDelete={handleRequestDelete}
        onArchive={handleRequestArchive}
        isSelectionMode={isSelectionMode}
        selectedReportIds={new Set(selectedReports.keys())}
        onToggleSelection={handleToggleSelection}
      />

      {/* Floating action bar when reports are selected */}
      {isSelectionMode && selectedReports.size > 0 && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-background border rounded-lg shadow-lg p-4 flex items-center gap-4 z-50"
          data-testid="selection-action-bar"
        >
          <span className="text-sm font-medium">
            {selectedReports.size} report{selectedReports.size !== 1 ? "s" : ""} selected
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearSelection}
            data-testid="clear-selection"
          >
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowBulkArchiveDialog(true)}
            data-testid="bulk-archive-button"
          >
            <Archive className="h-4 w-4 mr-2" />
            Archive
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowBulkDeleteDialog(true)}
            className="text-destructive hover:text-destructive"
            data-testid="bulk-delete-button"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
          <Button
            size="sm"
            onClick={() => setShowDistributeDialog(true)}
            data-testid="send-to-athletes-button"
          >
            <Send className="h-4 w-4 mr-2" />
            Send to Athletes
          </Button>
        </div>
      )}

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

      {/* Archive Dialog */}
      <AlertDialog open={!!archiveReportId} onOpenChange={() => setArchiveReportId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Report</AlertDialogTitle>
            <AlertDialogDescription>
              Archive this report? Archived reports will be hidden from your view but athletes who received them can still see them.
              You can view and restore archived reports from the filter menu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchiveReport} disabled={archiveReport.isPending}>
              {archiveReport.isPending ? "Archiving..." : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Archive Dialog */}
      <AlertDialog open={showBulkArchiveDialog} onOpenChange={setShowBulkArchiveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Reports</AlertDialogTitle>
            <AlertDialogDescription>
              Archive {selectedReports.size} report{selectedReports.size !== 1 ? "s" : ""}?
              Archived reports will be hidden from your view but athletes who received them can still see them.
              You can view and restore archived reports from the filter menu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkArchive} disabled={bulkArchive.isPending}>
              {bulkArchive.isPending ? "Archiving..." : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Reports Permanently</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete {selectedReports.size} report{selectedReports.size !== 1 ? "s" : ""}?
              This will remove them for everyone, including athletes who received them.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkDelete.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDelete.isPending ? "Deleting..." : "Delete Permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Distribute Dialog */}
      <BulkDistributeReportsDialog
        open={showDistributeDialog}
        onOpenChange={setShowDistributeDialog}
        reports={Array.from(selectedReports.values()).map((report) => ({
          id: report.id,
          name: report.name,
          athleteName: report.targetAthleteName || report.sentToAthlete?.athleteName,
          sentToAthlete: report.sentToAthlete,
        }))}
        onSuccess={handleExitSelectionMode}
      />
    </div>
  );
}
