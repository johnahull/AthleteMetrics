import { useState } from "react";
import { useBulkDistributeReports } from "@/hooks/use-share-report";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Loader2, ArrowRight, CheckCircle } from "lucide-react";

interface ReportForDistribution {
  id: string;
  name: string;
  athleteName?: string;
  sentToAthlete?: {
    sentAt: string;
    athleteName: string;
  } | null;
}

interface BulkDistributeReportsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reports: ReportForDistribution[];
  onSuccess?: () => void;
}

export function BulkDistributeReportsDialog({
  open,
  onOpenChange,
  reports,
  onSuccess,
}: BulkDistributeReportsDialogProps) {
  const [message, setMessage] = useState("");
  const bulkDistribute = useBulkDistributeReports();

  // Filter to only reports that haven't been sent yet
  const reportsToSend = reports.filter((r) => !r.sentToAthlete);
  const alreadySentReports = reports.filter((r) => r.sentToAthlete);

  // Reset state when dialog closes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setMessage("");
    }
    onOpenChange(isOpen);
  };

  const handleDistribute = async () => {
    if (reportsToSend.length === 0) {
      return;
    }

    try {
      await bulkDistribute.mutateAsync({
        reportIds: reportsToSend.map((r) => r.id),
        message: message || undefined,
      });
      handleOpenChange(false);
      onSuccess?.();
    } catch {
      // Error toast is handled by the hook's onError callback
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        data-testid="bulk-distribute-dialog"
      >
        <DialogHeader>
          <DialogTitle>Send Reports to Athletes</DialogTitle>
          <DialogDescription>
            Each individual report will be sent to its respective athlete
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Report mapping table */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Reports to send</Label>
              <Badge variant="secondary">
                {reportsToSend.length} of {reports.length} reports
              </Badge>
            </div>

            <ScrollArea className="h-[200px] border rounded-md">
              <div className="p-3 space-y-2">
                {/* Header row */}
                <div className="grid grid-cols-[1fr_auto_1fr] gap-2 text-xs font-medium text-muted-foreground pb-2 border-b">
                  <span>Report</span>
                  <span></span>
                  <span>Recipient</span>
                </div>

                {/* Reports to send */}
                {reportsToSend.map((report) => (
                  <div
                    key={report.id}
                    className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center py-1"
                    data-testid={`distribute-row-${report.id}`}
                  >
                    <span className="text-sm truncate" title={report.name}>
                      {report.name}
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground truncate">
                      {report.athleteName || "Athlete"}
                    </span>
                  </div>
                ))}

                {/* Already sent reports */}
                {alreadySentReports.map((report) => (
                  <div
                    key={report.id}
                    className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center py-1 opacity-50"
                    data-testid={`distribute-row-sent-${report.id}`}
                  >
                    <span className="text-sm truncate line-through" title={report.name}>
                      {report.name}
                    </span>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-muted-foreground truncate flex items-center gap-1">
                      <span>{report.sentToAthlete?.athleteName || "Athlete"}</span>
                      <Badge variant="outline" className="text-xs ml-1">
                        Sent
                      </Badge>
                    </span>
                  </div>
                ))}

                {/* Empty state */}
                {reports.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-4">
                    No reports selected
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Optional message */}
          <div className="space-y-2">
            <Label htmlFor="distribute-message">Message (optional)</Label>
            <Textarea
              id="distribute-message"
              placeholder="Add a personal note to include with the reports..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={1000}
            />
            <p className="text-xs text-muted-foreground text-right">
              {message.length}/1000
            </p>
          </div>

          {/* Info text */}
          <p className="text-sm text-muted-foreground">
            Athletes will receive a notification and can view their report in the "My Reports" section.
          </p>
        </div>

        <DialogFooter className="mt-4">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            data-testid="cancel-distribute-button"
          >
            Cancel
          </Button>
          <Button
            onClick={handleDistribute}
            disabled={bulkDistribute.isPending || reportsToSend.length === 0}
            data-testid="confirm-distribute-button"
          >
            {bulkDistribute.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send to {reportsToSend.length} Athlete{reportsToSend.length !== 1 ? "s" : ""}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
