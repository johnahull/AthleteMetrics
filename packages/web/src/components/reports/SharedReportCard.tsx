import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface SharedReportCardProps {
  shareId: string;
  reportId: string;
  reportName: string;
  reportType: "team" | "individual";
  sharedBy: { firstName: string; lastName: string } | null;
  message?: string;
  createdAt: string;
  isNew: boolean;
  onView: () => void;
  onDismiss?: () => void;
}

export function SharedReportCard({
  reportName,
  reportType,
  sharedBy,
  message,
  createdAt,
  isNew,
  onView,
  onDismiss,
}: SharedReportCardProps) {
  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    onDismiss?.();
  };

  return (
    <Card
      className="hover:bg-accent/50 cursor-pointer transition-colors"
      onClick={onView}
      data-testid="shared-report-card"
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium truncate">{reportName}</h3>
              {isNew && (
                <Badge variant="default" className="shrink-0" data-testid="new-report-badge">
                  New
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mb-1">
              {sharedBy
                ? `Shared by ${sharedBy.firstName} ${sharedBy.lastName}`
                : "Shared by a former coach"}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
            </p>
            {message && (
              // Safe: React automatically escapes text content in JSX, preventing XSS
              <p className="text-sm mt-2 italic text-muted-foreground line-clamp-2">
                "{message}"
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            {onDismiss && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={handleDismiss}
                title="Dismiss report"
                data-testid="dismiss-report-button"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
