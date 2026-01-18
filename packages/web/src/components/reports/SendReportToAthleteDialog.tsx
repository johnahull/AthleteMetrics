import { useState } from "react";
import { useShareReport } from "@/hooks/use-share-report";
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
import { Send, Loader2, UserCircle } from "lucide-react";

interface SendReportToAthleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: string;
  reportName: string;
  athleteId: string;
  athleteName: string;
  athleteEmail?: string;
}

export function SendReportToAthleteDialog({
  open,
  onOpenChange,
  reportId,
  reportName,
  athleteId,
  athleteName,
  athleteEmail,
}: SendReportToAthleteDialogProps) {
  const [message, setMessage] = useState("");
  const shareReport = useShareReport();

  const handleShare = async () => {
    try {
      await shareReport.mutateAsync({ reportId, athleteId, message: message || undefined });
      setMessage("");
      onOpenChange(false);
    } catch {
      // Error toast is handled by the hook's onError callback
      // Dialog stays open for retry
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Report to Athlete</DialogTitle>
          <DialogDescription>
            Share "{reportName}" with {athleteName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Recipient info */}
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <UserCircle className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">{athleteName}</p>
              {athleteEmail && (
                <p className="text-sm text-muted-foreground">{athleteEmail}</p>
              )}
            </div>
          </div>

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
            {athleteName} will receive a notification and can view this report in their "My Reports" section.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleShare} disabled={shareReport.isPending}>
            {shareReport.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send Report
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
