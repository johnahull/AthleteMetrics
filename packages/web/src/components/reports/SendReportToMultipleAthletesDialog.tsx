import { useState, useMemo } from "react";
import { useBulkShareReport, useReportShares } from "@/hooks/use-share-report";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TeamAthleteSelector } from "@/components/ui/team-athlete-selector";
import { Send, Loader2, AlertTriangle, Info } from "lucide-react";
import { format } from "date-fns";

interface SendReportToMultipleAthletesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: string;
  reportName: string;
  organizationId: string;
}

export function SendReportToMultipleAthletesDialog({
  open,
  onOpenChange,
  reportId,
  reportName,
  organizationId,
}: SendReportToMultipleAthletesDialogProps) {
  const [message, setMessage] = useState("");
  const [selectedAthleteIds, setSelectedAthleteIds] = useState<string[]>([]);
  const bulkShareReport = useBulkShareReport();

  // Get existing shares to determine which athletes already have the report
  const { data: sharesData } = useReportShares(reportId);

  // Create a map of athleteId -> sentDate for disabled athletes
  const disabledAthleteIds = useMemo(() => {
    const map = new Map<string, Date>();
    if (sharesData?.shares) {
      sharesData.shares.forEach(share => {
        map.set(share.athlete.id, new Date(share.createdAt));
      });
    }
    return map;
  }, [sharesData]);

  // Create label function for disabled athletes
  const disabledLabel = (date: Date) => {
    return `Sent ${format(date, 'MMM d, yyyy')}`;
  };

  const alreadySentCount = disabledAthleteIds.size;
  const hasWarning = selectedAthleteIds.length > 100;

  // Reset state when dialog closes for better UX
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedAthleteIds([]);
      setMessage("");
    }
    onOpenChange(isOpen);
  };

  const handleShare = async () => {
    if (selectedAthleteIds.length === 0) {
      return;
    }

    try {
      await bulkShareReport.mutateAsync({
        reportId,
        athleteIds: selectedAthleteIds,
        message: message || undefined,
      });
      handleOpenChange(false);
    } catch {
      // Error toast is handled by the hook's onError callback
      // Dialog stays open for retry
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-6xl max-h-[90vh] overflow-y-auto"
        data-testid="send-report-multi-dialog"
      >
        <DialogHeader>
          <DialogTitle>Send Report to Athletes</DialogTitle>
          <DialogDescription>
            Share "{reportName}" with multiple athletes at once
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Alerts with aria-live for screen reader announcements */}
          <div aria-live="polite" className="space-y-2">
            {/* Info about already sent */}
            {alreadySentCount > 0 && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  {alreadySentCount} athlete{alreadySentCount !== 1 ? 's' : ''} already have this report and cannot be selected again.
                </AlertDescription>
              </Alert>
            )}

            {/* Warning about large selection */}
            {hasWarning && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  You've selected over 100 athletes. Consider breaking this into smaller batches for better performance.
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Team and athlete selector */}
          <TeamAthleteSelector
            organizationId={organizationId}
            selectedAthleteIds={selectedAthleteIds}
            onSelectionChange={setSelectedAthleteIds}
            disabledAthleteIds={disabledAthleteIds}
            disabledLabel={disabledLabel}
          />

          {/* Optional message */}
          <div className="space-y-2">
            <Label htmlFor="message">Message (optional)</Label>
            <Textarea
              id="message"
              placeholder="Add a personal note to go with the report..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={1000}
            />
            <p className="text-xs text-muted-foreground text-right">
              {message.length}/1000
            </p>
          </div>

          {/* Info about notification */}
          <p className="text-sm text-muted-foreground">
            Selected athletes will receive a notification and can view this report in their "My Reports" section.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="cancel-multi-share-button"
          >
            Cancel
          </Button>
          <Button
            onClick={handleShare}
            disabled={bulkShareReport.isPending || selectedAthleteIds.length === 0}
            data-testid="confirm-multi-share-button"
          >
            {bulkShareReport.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send to {selectedAthleteIds.length} Athlete{selectedAthleteIds.length !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
