import { useRoute } from "wouter";
import { useReport, useGenerateReport } from "@/hooks/use-reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { TeamReportView } from "@/components/reports/TeamReportView";
import { IndividualReportView } from "@/components/reports/IndividualReportView";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { BreadcrumbNavigation } from "@/components/ui/breadcrumb-navigation";
import { useBreadcrumbs } from "@/hooks/useBreadcrumbs";

export default function ReportView() {
  const [, params] = useRoute("/reports/:id");
  const [, setLocation] = useLocation();
  const reportId = params?.id || "";

  const { data: report, isLoading, error } = useReport(reportId);
  const generateReport = useGenerateReport(reportId);

  // Generate breadcrumbs - use report name if available
  const breadcrumbs = useBreadcrumbs('report', {
    name: report?.name || report?.reportType
  });

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex justify-center">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive">Failed to load report. Please try again.</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => setLocation("/reports")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Reports
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      {/* Breadcrumb Navigation */}
      <BreadcrumbNavigation items={breadcrumbs} />

      <Button
        variant="ghost"
        className="mb-4"
        onClick={() => setLocation("/reports")}
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Reports
      </Button>

      {report.reportType === "team" ? (
        <TeamReportView report={report} />
      ) : (
        <IndividualReportView report={report} />
      )}
    </div>
  );
}
