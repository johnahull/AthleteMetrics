import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { MultiIndividualReportView } from "@/components/reports/MultiIndividualReportView";

export default function MultiReportView() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // Parse report IDs from query string
  const queryParams = new URLSearchParams(window.location.search);
  const idsParam = queryParams.get("ids");
  const reportIds = idsParam ? idsParam.split(",") : [];

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

  // Validate we have report IDs
  if (reportIds.length === 0) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Invalid Request</CardTitle>
          </CardHeader>
          <CardContent>
            <p>No report IDs provided.</p>
            <Button
              onClick={() => setLocation("/reports")}
              className="mt-4"
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
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/reports")}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Reports
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Individual Reports</h1>
          <p className="text-muted-foreground mt-1">
            Viewing {reportIds.length} athlete {reportIds.length === 1 ? "report" : "reports"}
          </p>
        </div>
      </div>

      <MultiIndividualReportView reportIds={reportIds} />
    </div>
  );
}
