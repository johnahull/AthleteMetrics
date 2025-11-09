import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useReports, useDeleteReport } from "@/hooks/use-reports";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, Eye, Trash2 } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ReportWizard } from "@/components/reports/ReportWizard";
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
import { format } from "date-fns";

export default function Reports() {
  const { user, organizationContext } = useAuth();
  const [, setLocation] = useLocation();
  const [showWizard, setShowWizard] = useState(false);
  const [deleteReportId, setDeleteReportId] = useState<string | null>(null);

  const { data: reports, isLoading, error } = useReports(organizationContext || undefined);
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

  const handleViewReport = (reportId: string) => {
    setLocation(`/reports/${reportId}`);
  };

  const handleDeleteReport = async () => {
    if (deleteReportId) {
      await deleteReport.mutateAsync(deleteReportId);
      setDeleteReportId(null);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
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

      {isLoading ? (
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-destructive text-center">
              Failed to load reports. Please try again.
            </p>
          </CardContent>
        </Card>
      ) : !reports || reports.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No reports yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first report to get started
            </p>
            {canCreateReports && (
              <Button onClick={() => setShowWizard(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Report
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>All Reports</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell className="font-medium">{report.name}</TableCell>
                    <TableCell>
                      <Badge variant={report.reportType === "coach" ? "default" : "secondary"}>
                        {report.reportType === "coach" ? "Coach" : "Individual"}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {report.description || "-"}
                    </TableCell>
                    <TableCell>
                      {format(new Date(report.createdAt), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewReport(report.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {canCreateReports && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteReportId(report.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
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
    </div>
  );
}
