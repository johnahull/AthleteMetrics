import { useState, useMemo } from 'react';
import { Clock, Pin, FileText, Loader2, Trash2, CheckCircle, Archive } from 'lucide-react';
import { format } from 'date-fns';
import { useReportsWithFilters, usePinReport } from '@/hooks/use-reports';
import type { Report } from '@shared/schema';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';

// Extended report type with sentToAthlete status
interface ReportWithSentStatus extends Report {
  targetAthleteName?: string;
  sentToAthlete?: {
    sentAt: string;
    athleteName: string;
  } | null;
}

interface RecentReportsSectionProps {
  organizationId?: string;
  filters?: {
    search?: string;
    reportType?: 'all' | 'individual' | 'team';
    dateFrom?: string;
    dateTo?: string;
    metrics?: string[];
    teamIds?: string[];
    includeArchived?: boolean;
  };
  onReportClick?: (report: Report) => void;
  onDelete?: (reportId: string, e: React.MouseEvent) => void;
  onArchive?: (reportId: string, e: React.MouseEvent) => void;
  limit?: number;
  // Selection mode props
  isSelectionMode?: boolean;
  selectedReportIds?: Set<string>;
  onToggleSelection?: (report: ReportWithSentStatus) => void;
}

export function RecentReportsSection({
  organizationId,
  filters,
  onReportClick,
  onDelete,
  onArchive,
  limit = 25,
  isSelectionMode = false,
  selectedReportIds,
  onToggleSelection,
}: RecentReportsSectionProps) {
  const [currentLimit, setCurrentLimit] = useState(limit);

  // Memoize the filters object to prevent unnecessary re-renders
  const queryFilters = useMemo(() => ({
    search: filters?.search || undefined,
    reportType: filters?.reportType === 'all' ? undefined : filters?.reportType,
    dateFrom: filters?.dateFrom,
    dateTo: filters?.dateTo,
    metrics: filters?.metrics,
    teamIds: filters?.teamIds,
    pinned: false,
    includeArchived: filters?.includeArchived,
  }), [filters?.search, filters?.reportType, filters?.dateFrom, filters?.dateTo, filters?.metrics, filters?.teamIds, filters?.includeArchived]);

  // Memoize pagination params to ensure stable reference
  const paginationParams = useMemo(() => ({
    limit: currentLimit,
    offset: 0,
  }), [currentLimit]);

  // Fetch reports excluding pinned ones
  const { data, isLoading, error } = useReportsWithFilters(
    organizationId || '',
    queryFilters,
    paginationParams
  );

  const pinReport = usePinReport();

  const reports = data?.reports || [];
  const pagination = data?.pagination;

  // Handle pin action
  const handlePin = (reportId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    pinReport.mutate(reportId);
  };

  // Handle report card click
  const handleReportClick = (report: Report) => {
    if (onReportClick) {
      onReportClick(report as any); // Type assertion to handle minor schema differences
    }
  };

  // Handle load more
  const handleLoadMore = () => {
    setCurrentLimit((prev) => prev + limit);
  };

  // Loading state
  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading reports...
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load reports. Please try again later.
        </AlertDescription>
      </Alert>
    );
  }

  // Empty state
  if (!isLoading && reports.length === 0) {
    return (
      <div className="text-center py-12 px-4">
        <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">No reports found</h3>
        <p className="text-sm text-muted-foreground">
          Create your first report to get started with performance analytics.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Clock className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Recent Reports</h2>
        {pagination && <Badge variant="secondary">{pagination.total}</Badge>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reports.map((report) => {
          const reportWithStatus = report as unknown as ReportWithSentStatus;
          const isSelected = selectedReportIds?.has(report.id) ?? false;
          const isIndividual = report.reportType === 'individual';
          const canSelect = isSelectionMode && isIndividual;

          return (
            <Card
              key={report.id}
              className={`hover:shadow-md transition-shadow cursor-pointer relative ${
                isSelected ? 'ring-2 ring-primary' : ''
              } ${isSelectionMode && !isIndividual ? 'opacity-50' : ''}`}
              data-testid={`${report.reportType}-report-${report.id}`}
            >
              <button
                onClick={() => {
                  if (canSelect && onToggleSelection) {
                    onToggleSelection(reportWithStatus);
                  } else if (!isSelectionMode) {
                    handleReportClick(report as any);
                  }
                }}
                className="text-left w-full"
                disabled={isSelectionMode && !isIndividual}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    {/* Checkbox for selection mode */}
                    {isSelectionMode && (
                      <div className="flex-shrink-0 pt-1" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => {
                            if (canSelect && onToggleSelection) {
                              onToggleSelection(reportWithStatus);
                            }
                          }}
                          disabled={!isIndividual}
                          aria-label={`Select ${report.name}`}
                          data-testid={`select-report-${report.id}`}
                        />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">{report.name}</CardTitle>
                      {report.description && (
                        <CardDescription className="text-sm line-clamp-2 mt-1">
                          {report.description}
                        </CardDescription>
                      )}
                    </div>

                    {!isSelectionMode && (
                      <div className="flex items-center gap-1">
                        {/* Pin button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 flex-shrink-0"
                          onClick={(e) => handlePin(report.id, e)}
                          disabled={pinReport.isPending}
                          title="Pin report"
                          aria-label="Pin report"
                        >
                          <Pin className="h-4 w-4 text-muted-foreground hover:text-primary" />
                        </Button>

                        {/* Archive button */}
                        {onArchive && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 flex-shrink-0"
                            onClick={(e) => onArchive(report.id, e)}
                            title="Archive report"
                            aria-label="Archive report"
                          >
                            <Archive className="h-4 w-4 text-muted-foreground hover:text-primary" />
                          </Button>
                        )}

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
                    )}
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
                    {/* Sent status badge for individual reports */}
                    {isIndividual && reportWithStatus.sentToAthlete && (
                      <Badge variant="secondary" className="text-xs flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Sent {format(new Date(reportWithStatus.sentToAthlete.sentAt), 'MMM d')}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </button>
            </Card>
          );
        })}
      </div>

      {/* Load More Button */}
      {pagination?.hasMore && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            onClick={handleLoadMore}
            disabled={isLoading}
            aria-label="Load more reports"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Loading...
              </>
            ) : (
              <>Load More</>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
