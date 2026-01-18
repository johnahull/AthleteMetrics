import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";
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
}

export function SharedReportCard({
  reportName,
  reportType,
  sharedBy,
  message,
  createdAt,
  isNew,
  onView,
}: SharedReportCardProps) {
  return (
    <Card
      className="hover:bg-accent/50 cursor-pointer transition-colors"
      onClick={onView}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium truncate">{reportName}</h3>
              {isNew && (
                <Badge variant="default" className="shrink-0">
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
          <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 ml-2" />
        </div>
      </CardContent>
    </Card>
  );
}
