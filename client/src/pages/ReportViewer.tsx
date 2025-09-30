/**
 * Report Viewer Page
 * Displays a generated report by share token
 */

import React from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { IndividualReport } from "@/components/reports/templates/IndividualReport";
import { TeamReport } from "@/components/reports/templates/TeamReport";
import { MultiAthleteReport } from "@/components/reports/templates/MultiAthleteReport";
import { RecruitingReport } from "@/components/reports/templates/RecruitingReport";

export function ReportViewer() {
  const [, params] = useRoute("/reports/view/:shareToken");
  const shareToken = params?.shareToken;

  // Fetch report data
  const { data: reportData, isLoading, error } = useQuery({
    queryKey: ["report", shareToken],
    queryFn: async () => {
      if (!shareToken) throw new Error("No share token provided");
      const res = await fetch(`/api/reports/shared/${shareToken}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Report not found");
        throw new Error("Failed to fetch report");
      }
      return res.json();
    },
    enabled: !!shareToken,
  });

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-12">
            <div className="text-center text-gray-500">Loading report...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !reportData) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-12">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-red-600 mb-2">Report Not Found</h2>
              <p className="text-gray-600 mb-4">
                {error instanceof Error ? error.message : "This report may have expired or been deleted."}
              </p>
              <Link href="/reports/history">
                <Button>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Report History
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { metadata, data, config } = reportData;

  // Render the appropriate report template based on type
  const renderReport = () => {
    switch (metadata.reportType) {
      case "individual":
      case "recruiting":
        return <IndividualReport data={data} />;
      case "team":
        return <TeamReport data={data} />;
      case "multi_athlete":
        return <MultiAthleteReport data={data} />;
      default:
        return (
          <div className="text-center text-gray-500 p-12">
            Unknown report type: {metadata.reportType}
          </div>
        );
    }
  };

  return (
    <div className="container mx-auto p-6">
      {/* Header with actions - hide on print */}
      <div className="mb-6 flex justify-between items-center print:hidden">
        <Link href="/reports/history">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Reports
          </Button>
        </Link>
        <Button onClick={handlePrint}>
          <Printer className="mr-2 h-4 w-4" />
          Print Report
        </Button>
      </div>

      {/* Report content */}
      <div className="bg-white">
        {renderReport()}
      </div>
    </div>
  );
}

export default ReportViewer;
