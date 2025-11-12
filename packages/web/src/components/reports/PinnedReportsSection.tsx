import { useState } from 'react';
import { Pin, ChevronDown, ChevronRight, Loader2, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useReportsWithFilters, useUnpinReport } from '@/hooks/use-reports';
import type { Report } from '@shared/schema';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface PinnedReportsSectionProps {
  organizationId?: string;
  onReportClick?: (report: Report) => void;
  onDelete?: (reportId: string, e: React.MouseEvent) => void;
  defaultCollapsed?: boolean;
}

export function PinnedReportsSection({
  organizationId,
  onReportClick,
  onDelete,
  defaultCollapsed = false,
}: PinnedReportsSectionProps) {
  const [isOpen, setIsOpen] = useState(!defaultCollapsed);

  // Fetch only pinned reports
  const { data, isLoading, error } = useReportsWithFilters(
    organizationId || '',
    { pinned: true },
    { limit: 10, offset: 0 }
  );

  const unpinReport = useUnpinReport();

  const reports = data?.reports || [];
  const pinnedCount = data?.pagination.total || 0;

  // Handle unpin action
  const handleUnpin = (reportId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    unpinReport.mutate(reportId);
  };

  // Handle report card click
  const handleReportClick = (report: Report) => {
    if (onReportClick) {
      onReportClick(report as any); // Type assertion to handle minor schema differences
    }
  };

  // Don't render section if no pinned reports
  if (!isLoading && !error && reports.length === 0) {
    return null;
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading pinned reports...
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load pinned reports. Please try again later.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="space-y-4">
      <div className="flex items-center justify-between">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="flex items-center gap-2 p-0 hover:bg-transparent">
            {isOpen ? (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            )}
            <div className="flex items-center gap-2">
              <Pin className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">Pinned Reports</h2>
              <Badge variant="secondary">{pinnedCount}</Badge>
            </div>
          </Button>
        </CollapsibleTrigger>

        {/* Pin limit indicator */}
        {pinnedCount >= 8 && (
          <div className="text-sm text-muted-foreground">
            {pinnedCount === 10 ? (
              <Badge variant="destructive">Maximum 10 reports pinned</Badge>
            ) : (
              <Badge variant="secondary">{pinnedCount} of 10 pinned</Badge>
            )}
          </div>
        )}
      </div>

      <CollapsibleContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reports.map((report) => (
            <Card
              key={report.id}
              className="hover:shadow-md transition-shadow cursor-pointer relative"
            >
              <button
                onClick={() => handleReportClick(report as any)}
                className="text-left w-full"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">{report.name}</CardTitle>
                      {report.description && (
                        <CardDescription className="text-sm line-clamp-2 mt-1">
                          {report.description}
                        </CardDescription>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Unpin button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 flex-shrink-0"
                        onClick={(e) => handleUnpin(report.id, e)}
                        disabled={unpinReport.isPending}
                        title="Unpin report"
                        aria-label="Unpin report"
                      >
                        <Pin className="h-4 w-4 fill-primary text-primary" />
                      </Button>

                      {/* Delete button */}
                      {onDelete && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 flex-shrink-0"
                          onClick={(e) => onDelete(report.id, e)}
                          title="Delete report"
                          aria-label="Delete report"
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize">
                        {report.reportType}
                      </Badge>
                      <span>{format(new Date(report.createdAt), 'MMM dd, yyyy')}</span>
                    </div>
                  </div>
                </CardContent>
              </button>
            </Card>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
