/**
 * Shared loading state component for report views
 *
 * This component consolidates the loading state UI previously duplicated across:
 * - TeamReportView.tsx
 * - IndividualReportView.tsx
 * - AthleteReportView.tsx (individual and team variants)
 */

import { Card, CardContent } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

interface ReportLoadingStateProps {
  /** Custom loading message (default: "Generating report...") */
  message?: string;
  /** Optional additional status text */
  status?: string;
}

/**
 * Displays a centered loading state within a Card.
 *
 * @example
 * // Basic usage
 * <ReportLoadingState />
 *
 * @example
 * // With custom message
 * <ReportLoadingState message="Loading team data..." />
 *
 * @example
 * // With status indicator
 * <ReportLoadingState message="Generating report..." status="Processing metrics..." />
 */
export function ReportLoadingState({
  message = "Generating report...",
  status,
}: ReportLoadingStateProps) {
  return (
    <Card>
      <CardContent className="py-12">
        <div className="flex flex-col items-center gap-4">
          <LoadingSpinner />
          <p className="text-muted-foreground">{message}</p>
          {status && (
            <p className="text-xs text-muted-foreground">Status: {status}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
