import { useAuth } from "@/lib/auth";
import { useMyReports } from "@/hooks/use-my-reports";
import { SharedReportCard } from "@/components/reports/SharedReportCard";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, AlertCircle, FileText } from "lucide-react";
import { Redirect, useLocation } from "wouter";

export default function MyReportsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  // Fetch shared reports
  const {
    data: reportsData,
    isLoading: reportsLoading,
    isError,
    error,
  } = useMyReports();

  // Redirect if not logged in
  if (!authLoading && !user) {
    return <Redirect to="/login" />;
  }

  // Redirect if not an athlete
  if (!authLoading && user && !user.athleteId) {
    return <Redirect to="/dashboard" />;
  }

  // Loading state
  if (authLoading || reportsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-500">Loading your reports...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Error Loading Reports
          </h2>
          <p className="text-gray-500 mb-4">
            {error?.message || "Unable to load your shared reports"}
          </p>
        </div>
      </div>
    );
  }

  const reports = reportsData?.reports || [];

  // Handle viewing a report
  const handleViewReport = (shareId: string) => {
    // Navigate to the report view page
    // Note: Report is marked as viewed in my-report-view.tsx's useEffect
    setLocation(`/my-reports/${shareId}`);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
          My Reports
        </h1>
        <p className="text-sm sm:text-base text-gray-500 mt-1">
          View performance reports shared with you by your coaches
        </p>
      </div>

      {/* Reports List */}
      {reports.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No reports yet
              </h3>
              <p className="text-gray-500 max-w-md mx-auto">
                When your coach shares performance reports with you, they'll
                appear here.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <SharedReportCard
              key={report.shareId}
              shareId={report.shareId}
              reportId={report.reportId}
              reportName={report.reportName}
              reportType={report.reportType}
              sharedBy={report.sharedBy}
              message={report.message}
              createdAt={report.createdAt}
              isNew={report.isNew}
              onView={() => handleViewReport(report.shareId)}
            />
          ))}
        </div>
      )}

      {/* Back to Dashboard Link */}
      <div className="pt-4 border-t border-gray-200">
        <a
          href="/my-dashboard"
          className="text-blue-600 hover:underline text-sm"
        >
          &larr; Back to Dashboard
        </a>
      </div>
    </div>
  );
}
