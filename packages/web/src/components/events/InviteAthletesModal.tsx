/**
 * InviteAthletesModal - Modal for inviting athletes to an event via email
 *
 * Features:
 * - Add multiple email addresses
 * - Duplicate detection
 * - Already-invited warning
 * - Bulk invitation sending
 */

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useCreateEventInvitation, useEventInvitations } from "@/lib/events-api";
import { useToast } from "@/hooks/use-toast";
import { Mail, X, AlertCircle, Send, Plus } from "lucide-react";

interface InviteAthletesModalProps {
  eventId: string;
  eventName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function InviteAthletesModal({
  eventId,
  eventName,
  isOpen,
  onClose,
}: InviteAthletesModalProps) {
  const [emailInput, setEmailInput] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [alreadyInvitedWarning, setAlreadyInvitedWarning] = useState<string | null>(null);
  const { toast } = useToast();

  const createInvitationMutation = useCreateEventInvitation();
  const { data: existingInvitations } = useEventInvitations(eventId);

  // Get list of already-invited emails
  const invitedEmails = useMemo(() => {
    return (existingInvitations || []).map((inv) => inv.email?.toLowerCase()).filter(Boolean);
  }, [existingInvitations]);

  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleAddEmail = () => {
    const email = emailInput.trim().toLowerCase();

    // Clear previous messages
    setValidationError(null);
    setAlreadyInvitedWarning(null);

    if (!email) return;

    // Validate email format
    if (!isValidEmail(email)) {
      setValidationError("Please enter a valid email address");
      return;
    }

    // Check for duplicates in the list
    if (emails.includes(email)) {
      setValidationError("This email is already in the list");
      return;
    }

    // Check if already invited
    if (invitedEmails.includes(email)) {
      setAlreadyInvitedWarning(`${email} has already been invited to this event`);
      // Still allow adding, but show warning
    }

    setEmails([...emails, email]);
    setEmailInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddEmail();
    }
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    setEmails(emails.filter((email) => email !== emailToRemove));
    setAlreadyInvitedWarning(null);
  };

  const handleSendInvitations = async () => {
    if (emails.length === 0) {
      setValidationError("Please add at least one email address");
      return;
    }

    try {
      // Send invitations for each email
      for (const email of emails) {
        await createInvitationMutation.mutateAsync({
          eventId,
          data: { email },
        });
      }

      toast({
        title: "Invitations Sent",
        description: `${emails.length} invitation${emails.length > 1 ? "s" : ""} sent successfully.`,
      });

      // Reset and close
      setEmails([]);
      setEmailInput("");
      setValidationError(null);
      setAlreadyInvitedWarning(null);
      onClose();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send invitations",
      });
    }
  };

  const handleClose = () => {
    setEmails([]);
    setEmailInput("");
    setValidationError(null);
    setAlreadyInvitedWarning(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Invite Athletes
          </DialogTitle>
          <DialogDescription>
            Send email invitations to athletes for {eventName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Email Input */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="Enter email address"
                value={emailInput}
                onChange={(e) => {
                  setEmailInput(e.target.value);
                  setValidationError(null);
                }}
                onKeyDown={handleKeyDown}
                className="flex-1"
              />
              <Button type="button" size="icon" variant="outline" onClick={handleAddEmail}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Validation Error */}
            {validationError && (
              <p className="text-sm text-red-500 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                {validationError}
              </p>
            )}

            {/* Already Invited Warning */}
            {alreadyInvitedWarning && (
              <p className="text-sm text-amber-600 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                {alreadyInvitedWarning}
              </p>
            )}
          </div>

          {/* Email List */}
          {emails.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {emails.length} email{emails.length > 1 ? "s" : ""} to invite:
              </p>
              <div className="flex flex-wrap gap-2">
                {emails.map((email) => (
                  <Badge key={email} variant="secondary" className="flex items-center gap-1 py-1">
                    {email}
                    <button
                      type="button"
                      onClick={() => handleRemoveEmail(email)}
                      className="ml-1 hover:text-destructive"
                      aria-label="Remove"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSendInvitations}
            disabled={emails.length === 0 || createInvitationMutation.isPending}
          >
            <Send className="h-4 w-4 mr-2" />
            {createInvitationMutation.isPending
              ? "Sending..."
              : `Send ${emails.length} Invitation${emails.length !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default InviteAthletesModal;
