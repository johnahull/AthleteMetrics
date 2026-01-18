/**
 * Shared error state component for report views
 *
 * This component consolidates the error state UI previously duplicated across:
 * - TeamReportView.tsx
 * - IndividualReportView.tsx
 * - AthleteReportView.tsx (individual and team variants)
 */

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ReportErrorStateProps {
  /** Custom error message (default: "Failed to generate report. Please try again.") */
  message?: string;
  /** Optional detailed error description */
  errorDetails?: string;
  /** Optional retry callback - if provided, shows a retry button */
  onRetry?: () => void;
  /** Custom retry button text (default: "Retry") */
  retryText?: string;
}

/**
 * Displays a centered error state within a Card with an optional retry button.
 *
 * @example
 * // Basic usage
 * <ReportErrorState />
 *
 * @example
 * // With retry button
 * <ReportErrorState onRetry={() => generateReport.mutate({})} />
 *
 * @example
 * // With custom message and details
 * <ReportErrorState
 *   message="Failed to load report"
 *   errorDetails={error.message}
 *   onRetry={() => retry()}
 * />
 */
export function ReportErrorState({
  message = "Failed to generate report. Please try again.",
  errorDetails,
  onRetry,
  retryText = "Retry",
}: ReportErrorStateProps) {
  return (
    <Card>
      <CardContent className="py-8">
        <div className="flex flex-col items-center gap-4">
          <p className="text-destructive text-center">{message}</p>
          {errorDetails && (
            <p className="text-sm text-muted-foreground text-center">
              Error: {errorDetails}
            </p>
          )}
          {onRetry && (
            <Button onClick={onRetry} variant="outline">
              {retryText}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
