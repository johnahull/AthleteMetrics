import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { IndividualReportView } from "./IndividualReportView";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Report } from "@/types/report-types";

interface MultiIndividualReportViewProps {
  reportIds: string[];
}

export function MultiIndividualReportView({ reportIds }: MultiIndividualReportViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentReportId = reportIds[currentIndex];

  // Fetch current report
  const { data: report, isLoading, error } = useQuery({
    queryKey: ["/api/reports", currentReportId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/reports/${currentReportId}`);
      return res.json() as Promise<Report>;
    },
    enabled: !!currentReportId,
  });

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < reportIds.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center gap-4">
            <LoadingSpinner />
            <p className="text-muted-foreground">Loading report...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !report) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-destructive text-center">
            Failed to load report. Please try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Navigation Bar */}
      {reportIds.length > 1 && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevious}
                disabled={currentIndex === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous Athlete
              </Button>

              <div className="text-sm font-medium">
                Athlete {currentIndex + 1} of {reportIds.length}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleNext}
                disabled={currentIndex === reportIds.length - 1}
              >
                Next Athlete
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Individual Report */}
      <IndividualReportView report={report} />
    </div>
  );
}
