import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useMarkReportViewed } from "@/hooks/use-my-reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { AthleteReportView } from "@/components/reports/AthleteReportView";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { Redirect } from "wouter";
import { useEffect } from "react";
import type { Report } from "@/types/report-types";

interface SharedReportDetails {
  shareId: string;
  report: Report;
  message?: string;
  sharedBy: {
    firstName: string;
    lastName: string;
  } | null;
  createdAt: string;
}

export default function MyReportView() {
  const [, params] = useRoute("/my-reports/:shareId");
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const shareId = params?.shareId || "";

  // Mark report as viewed
  const markViewedMutation = useMarkReportViewed();

  // Fetch shared report details
  const {
    data: sharedReport,
    isLoading,
    error,
  } = useQuery<SharedReportDetails>({
    queryKey: ["/api/my/reports", shareId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/my/reports/${shareId}`);
      return res.json();
    },
    enabled: !!shareId,
  });

  // Mark as viewed when component mounts
  useEffect(() => {
    if (shareId) {
      markViewedMutation.mutate(shareId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareId]);

  // Redirect if not logged in
  if (!authLoading && !user) {
    return <Redirect to="/login" />;
  }

  // Redirect if not an athlete
  if (!authLoading && user && !user.athleteId) {
    return <Redirect to="/dashboard" />;
  }

  if (authLoading || isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex justify-center">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (error || !sharedReport) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive">
              Failed to load report. Please try again.
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => setLocation("/my-reports")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to My Reports
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { report, message, sharedBy } = sharedReport;

  return (
    <div className="container mx-auto py-8 space-y-4">
      {/* Back Button */}
      <Button
        variant="ghost"
        onClick={() => setLocation("/my-reports")}
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to My Reports
      </Button>

      {/* Coach Message (if present) */}
      {message && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              {sharedBy
                ? `Message from ${sharedBy.firstName} ${sharedBy.lastName}`
                : "Message from coach"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground italic">"{message}"</p>
          </CardContent>
        </Card>
      )}

      {/* Report View - Read-only for athletes */}
      <AthleteReportView report={report} />
    </div>
  );
}
