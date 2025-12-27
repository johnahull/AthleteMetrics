/**
 * InviteAthletesModal - Modal for inviting athletes to an event
 *
 * Features:
 * - Organization Members tab: Select athletes from the org with checkboxes
 * - By Email tab: Add email addresses for external invitations
 * - Status indicators for registered/pending/available athletes
 * - Search and filter functionality
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreateEventInvitation, useEventInvitations, useEventRegistrations } from "@/lib/events-api";
import { queries } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Mail, X, AlertCircle, Send, Plus, Users, Search, CheckCircle, Clock } from "lucide-react";

interface InviteAthletesModalProps {
  eventId: string;
  eventName: string;
  organizationId: string;
  isOpen: boolean;
  onClose: () => void;
}

type AthleteStatus = 'registered' | 'pending' | 'available';

interface AthleteWithStatus {
  id: string;
  userId: string;
  fullName: string;
  teamName?: string;
  status: AthleteStatus;
  isSelectable: boolean;
}

export function InviteAthletesModal({
  eventId,
  eventName,
  organizationId,
  isOpen,
  onClose,
}: InviteAthletesModalProps) {
  // Tab state
  const [activeTab, setActiveTab] = useState<"org" | "email">("org");

  // Org members state
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Email state (existing functionality)
  const [emailInput, setEmailInput] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [alreadyInvitedWarning, setAlreadyInvitedWarning] = useState<string | null>(null);

  const { toast } = useToast();

  // API queries
  const createInvitationMutation = useCreateEventInvitation();
  const { data: existingInvitations } = useEventInvitations(eventId);
  const { data: registrations } = useEventRegistrations(eventId);

  // Fetch organization athletes
  // Note: API returns array directly, athlete.id IS the userId (athletes are User records)
  const { data: athletesList, isLoading: athletesLoading } = useQuery(
    queries.athletes({ organizationId })
  );

  // Compute athlete status based on registrations and invitations
  const athletesWithStatus: AthleteWithStatus[] = useMemo(() => {
    // API returns array directly (not wrapped in { athletes: [] })
    const athletes = Array.isArray(athletesList) ? athletesList : [];
    if (!athletes.length) return [];

    return athletes.map((athlete: any) => {
      // athlete.id IS the userId (athletes are User records)
      const athleteUserId = athlete.id;
      const isRegistered = registrations?.some((r: any) => r.userId === athleteUserId);
      const invitation = existingInvitations?.find((i: any) => i.userId === athleteUserId);
      const hasPendingInvite = invitation?.status === 'pending';

      let status: AthleteStatus = 'available';
      if (isRegistered) status = 'registered';
      else if (hasPendingInvite) status = 'pending';

      return {
        id: athlete.id,
        userId: athleteUserId,  // athlete.id IS the userId
        fullName: athlete.fullName || athlete.name || `${athlete.firstName} ${athlete.lastName}`,
        teamName: athlete.teamName,
        status,
        isSelectable: status === 'available',
      };
    });
  }, [athletesList, registrations, existingInvitations]);

  // Filter athletes by search query
  const filteredAthletes = useMemo(() => {
    if (!searchQuery.trim()) return athletesWithStatus;
    const query = searchQuery.toLowerCase();
    return athletesWithStatus.filter(a =>
      a.fullName.toLowerCase().includes(query)
    );
  }, [athletesWithStatus, searchQuery]);

  // Selectable athletes (for Select All)
  const selectableAthletes = filteredAthletes.filter(a => a.isSelectable);
  const allSelectableSelected = selectableAthletes.length > 0 &&
    selectableAthletes.every(a => selectedUserIds.includes(a.userId));

  // Get list of already-invited emails
  const invitedEmails = useMemo(() => {
    return (existingInvitations || []).map((inv: any) => inv.email?.toLowerCase()).filter(Boolean);
  }, [existingInvitations]);

  // === Org Members Handlers ===

  const handleToggleAthlete = (userId: string) => {
    setSelectedUserIds(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSelectAll = () => {
    if (allSelectableSelected) {
      // Deselect all
      setSelectedUserIds([]);
    } else {
      // Select all selectable
      setSelectedUserIds(selectableAthletes.map(a => a.userId));
    }
  };

  const handleSendOrgInvitations = async () => {
    if (selectedUserIds.length === 0) return;

    try {
      for (const userId of selectedUserIds) {
        await createInvitationMutation.mutateAsync({
          eventId,
          data: { userId },
        });
      }

      toast({
        title: "Invitations Sent",
        description: `${selectedUserIds.length} invitation${selectedUserIds.length > 1 ? "s" : ""} sent successfully.`,
      });

      setSelectedUserIds([]);
      onClose();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send invitations",
      });
    }
  };

  // === Email Handlers (existing functionality) ===

  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleAddEmail = () => {
    const email = emailInput.trim().toLowerCase();

    setValidationError(null);
    setAlreadyInvitedWarning(null);

    if (!email) return;

    if (!isValidEmail(email)) {
      setValidationError("Please enter a valid email address");
      return;
    }

    if (emails.includes(email)) {
      setValidationError("This email is already in the list");
      return;
    }

    if (invitedEmails.includes(email)) {
      setAlreadyInvitedWarning(`${email} has already been invited to this event`);
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

  const handleSendEmailInvitations = async () => {
    if (emails.length === 0) {
      setValidationError("Please add at least one email address");
      return;
    }

    try {
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

  // === Common Handlers ===

  const handleClose = () => {
    setSelectedUserIds([]);
    setSearchQuery("");
    setEmails([]);
    setEmailInput("");
    setValidationError(null);
    setAlreadyInvitedWarning(null);
    onClose();
  };

  // Render status badge
  const renderStatusBadge = (status: AthleteStatus) => {
    switch (status) {
      case 'registered':
        return (
          <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50">
            <CheckCircle className="h-3 w-3 mr-1" />
            Registered
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="outline" className="text-yellow-600 border-yellow-300 bg-yellow-50">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
      default:
        return null;
    }
  };

  // Determine send button state based on active tab
  const isOrgTab = activeTab === "org";
  const sendCount = isOrgTab ? selectedUserIds.length : emails.length;
  const canSend = sendCount > 0;
  const isPending = createInvitationMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Invite Athletes
          </DialogTitle>
          <DialogDescription>
            Send invitations to athletes for {eventName}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "org" | "email")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="org">
              <Users className="h-4 w-4 mr-2" />
              Organization
            </TabsTrigger>
            <TabsTrigger value="email">
              <Mail className="h-4 w-4 mr-2" />
              By Email
            </TabsTrigger>
          </TabsList>

          {/* Organization Members Tab */}
          <TabsContent value="org" className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search athletes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Select All */}
            {selectableAthletes.length > 0 && (
              <div className="flex items-center space-x-2 py-2 border-b">
                <Checkbox
                  id="select-all"
                  checked={allSelectableSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all eligible athletes"
                />
                <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                  Select All ({selectableAthletes.length} eligible)
                </label>
              </div>
            )}

            {/* Athletes List */}
            <ScrollArea className="h-[240px]">
              {athletesLoading ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : filteredAthletes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchQuery ? "No athletes match your search" : "No athletes in organization"}
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredAthletes.map((athlete) => (
                    <div
                      key={athlete.id}
                      data-athlete-row
                      className={`flex items-center justify-between p-2 rounded-md hover:bg-muted/50 ${
                        !athlete.isSelectable ? 'opacity-60' : ''
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <Checkbox
                          id={`athlete-${athlete.userId}`}
                          checked={selectedUserIds.includes(athlete.userId)}
                          onCheckedChange={() => handleToggleAthlete(athlete.userId)}
                          disabled={!athlete.isSelectable}
                          aria-label={athlete.fullName}
                        />
                        <div>
                          <p className="text-sm font-medium">{athlete.fullName}</p>
                          {athlete.teamName && (
                            <p className="text-xs text-muted-foreground">{athlete.teamName}</p>
                          )}
                        </div>
                      </div>
                      {renderStatusBadge(athlete.status)}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Selection Count */}
            {selectedUserIds.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {selectedUserIds.length} selected
              </p>
            )}
          </TabsContent>

          {/* By Email Tab */}
          <TabsContent value="email" className="space-y-4">
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

              {validationError && (
                <p className="text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  {validationError}
                </p>
              )}

              {alreadyInvitedWarning && (
                <p className="text-sm text-amber-600 flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  {alreadyInvitedWarning}
                </p>
              )}
            </div>

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
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={isOrgTab ? handleSendOrgInvitations : handleSendEmailInvitations}
            disabled={!canSend || isPending}
          >
            <Send className="h-4 w-4 mr-2" />
            {isPending
              ? "Sending..."
              : `Send ${sendCount} Invitation${sendCount !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default InviteAthletesModal;
