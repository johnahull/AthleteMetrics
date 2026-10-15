/**
 * AddAthletesModal - Managers add organization athletes straight onto an event roster.
 *
 * No invitation, no email, no push: the event simply shows up in the athlete's "My Events".
 * Athletes are checked in by default (ready for data entry); turn the switch off to only approve them.
 */

import { useEffect, useMemo, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useAddEventAthletes, useEventRegistrations, type AddEventAthletesResult } from "@/lib/events-api";
import { queries } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Search, UserPlus } from "lucide-react";

interface AddAthletesModalProps {
  eventId: string;
  eventName: string;
  organizationId: string;
  isOpen: boolean;
  onClose: () => void;
}

const REGISTRATION_LABELS: Record<string, string> = {
  checked_in: "Checked in",
  completed: "Completed",
  approved: "Approved",
  pending: "Pending approval",
  waitlisted: "Waitlisted",
  declined: "Declined",
  cancelled: "Cancelled",
};

/** The API takes at most 200 ids per request */
const MAX_BATCH = 200;

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** One plain sentence for the single toast the app can show at a time */
export function describeAddResult(result: AddEventAthletesResult): string {
  const added = result.added.length + result.updated.length;
  let text = added > 0 ? `Added ${plural(added, "athlete")}` : "No athletes were added";
  if (result.alreadyOnEvent.length > 0) {
    const n = result.alreadyOnEvent.length;
    text += ` (${n} ${n === 1 ? "was" : "were"} already on the event)`;
  }
  if (result.rejected.length > 0) {
    text += `. ${result.rejected.length} could not be added because they are not athletes in this organization`;
  }
  if (result.overCapacity) {
    text += ". The event is now over capacity";
  }
  return text;
}

export function AddAthletesModal({ eventId, eventName, organizationId, isOpen, onClose }: AddAthletesModalProps) {
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [checkIn, setCheckIn] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { toast } = useToast();
  const addMutation = useAddEventAthletes();
  const { data: registrations } = useEventRegistrations(eventId);
  const { data: athletesList, isLoading: athletesLoading } = useQuery(queries.athletes({ organizationId }));

  // A fresh open starts without the previous attempt's error
  useEffect(() => {
    if (isOpen) setErrorMessage(null);
  }, [isOpen]);

  const athletes = useMemo(() => {
    const list = Array.isArray(athletesList) ? athletesList : [];
    return list.map((athlete: any) => {
      const registration = (registrations as any[] | undefined)?.find((r) => r.userId === athlete.id);
      const registrationStatus: string | undefined = registration?.status;
      return {
        userId: athlete.id as string,
        fullName: (athlete.fullName || athlete.name || `${athlete.firstName} ${athlete.lastName}`) as string,
        teamName: athlete.teamName as string | undefined,
        registrationStatus,
        // Already checked in / completed athletes cannot be added again
        isSelectable: registrationStatus !== "checked_in" && registrationStatus !== "completed",
      };
    });
  }, [athletesList, registrations]);

  const filteredAthletes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return query ? athletes.filter((a) => a.fullName.toLowerCase().includes(query)) : athletes;
  }, [athletes, searchQuery]);

  const selectable = filteredAthletes.filter((a) => a.isSelectable);
  const allSelected = selectable.length > 0 && selectable.every((a) => selectedUserIds.includes(a.userId));

  const toggle = (userId: string) =>
    setSelectedUserIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));

  const toggleAll = () =>
    setSelectedUserIds((prev) =>
      allSelected
        ? prev.filter((id) => !selectable.some((a) => a.userId === id))
        : Array.from(new Set([...prev, ...selectable.map((a) => a.userId)])).slice(0, MAX_BATCH),
    );

  const handleClose = () => {
    setSelectedUserIds([]);
    setSearchQuery("");
    setCheckIn(true);
    setErrorMessage(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (selectedUserIds.length === 0) return;
    setErrorMessage(null);
    try {
      const result = await addMutation.mutateAsync({ eventId, userIds: selectedUserIds, checkIn });
      toast({
        title: result.added.length + result.updated.length > 0 ? "Athletes added" : "No athletes added",
        description: describeAddResult(result),
      });
      handleClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to add athletes");
    }
  };

  const count = selectedUserIds.length;
  const atLimit = count >= MAX_BATCH;
  const isPending = addMutation.isPending;
  const buttonLabel = isPending ? "Adding..." : count === 0 ? "Add athletes" : `Add ${plural(count, "athlete")}`;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isPending && handleClose()}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Add athletes
          </DialogTitle>
          <DialogDescription>Add organization athletes directly to {eventName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search athletes..."
              aria-label="Search athletes"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {selectable.length > 0 && (
            <div className="flex items-center gap-x-2 py-2 border-b">
              <Checkbox
                id="add-select-all"
                checked={allSelected}
                onCheckedChange={toggleAll}
                aria-label="Select all eligible athletes"
              />
              <label htmlFor="add-select-all" className="text-sm font-medium cursor-pointer">
                Select All ({selectable.length} eligible)
              </label>
            </div>
          )}
          {(atLimit || selectable.length > MAX_BATCH) && (
            <p className="text-xs text-muted-foreground">You can add up to {MAX_BATCH} athletes at a time.</p>
          )}

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
                    key={athlete.userId}
                    className={`flex items-center justify-between gap-2 p-2 rounded-md hover:bg-muted/50 ${
                      athlete.isSelectable ? "" : "opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-x-3 min-w-0">
                      <Checkbox
                        id={`add-athlete-${athlete.userId}`}
                        checked={selectedUserIds.includes(athlete.userId)}
                        onCheckedChange={() => toggle(athlete.userId)}
                        disabled={!athlete.isSelectable || (atLimit && !selectedUserIds.includes(athlete.userId))}
                        aria-label={athlete.fullName}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{athlete.fullName}</p>
                        {athlete.teamName && <p className="text-xs text-muted-foreground truncate">{athlete.teamName}</p>}
                      </div>
                    </div>
                    {athlete.registrationStatus && (
                      <Badge variant="outline" className="shrink-0">
                        {REGISTRATION_LABELS[athlete.registrationStatus] ?? athlete.registrationStatus}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <Label htmlFor="add-check-in" className="cursor-pointer">
              Check them in now
            </Label>
            <Switch id="add-check-in" checked={checkIn} onCheckedChange={setCheckIn} />
          </div>

          <p className="text-sm text-muted-foreground">Added athletes are not emailed or notified.</p>

          {errorMessage && (
            <div role="alert" className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive break-words min-w-0">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0 break-words">{errorMessage}</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={count === 0 || isPending}>
            {buttonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
