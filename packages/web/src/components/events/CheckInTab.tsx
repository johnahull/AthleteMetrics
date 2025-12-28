/**
 * CheckInTab - Component for checking in athletes at events
 *
 * Features:
 * - Progress display showing check-in count
 * - Search functionality
 * - Filter by check-in status
 * - One-click check-in action
 */

import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useCheckInRegistration } from "@/lib/events-api";
import { useToast } from "@/hooks/use-toast";
import { Search, CheckCircle, Clock, UserCheck, Users } from "lucide-react";
import { format } from "date-fns";
import type { EventRegistration } from "@shared/schema";

// Extended registration type with user data
interface RegistrationWithUser extends EventRegistration {
  userFullNameSnapshot: string;
  user?: {
    firstName: string;
    lastName: string;
  };
}

interface CheckInTabProps {
  eventId: string;
  registrations: RegistrationWithUser[];
}

type FilterValue = "all" | "waiting" | "checked_in";

export function CheckInTab({ eventId, registrations }: CheckInTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");
  const { toast } = useToast();

  const checkInMutation = useCheckInRegistration();

  // Filter only approved and checked_in registrations (not pending or declined)
  const eligibleRegistrations = useMemo(() => {
    return registrations.filter(
      (reg) => reg.status === "approved" || reg.status === "checked_in"
    );
  }, [registrations]);

  // Calculate stats
  const totalCount = eligibleRegistrations.length;
  const checkedInCount = eligibleRegistrations.filter(
    (reg) => reg.checkedInAt || reg.status === "checked_in"
  ).length;
  const waitingCount = totalCount - checkedInCount;
  const progressPercentage = totalCount > 0 ? Math.round((checkedInCount / totalCount) * 100) : 0;

  // Filter and search registrations
  const filteredRegistrations = useMemo(() => {
    let result = eligibleRegistrations;

    // Apply status filter
    if (filter === "waiting") {
      result = result.filter((reg) => !reg.checkedInAt && reg.status !== "checked_in");
    } else if (filter === "checked_in") {
      result = result.filter((reg) => reg.checkedInAt || reg.status === "checked_in");
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((reg) =>
        reg.userFullNameSnapshot.toLowerCase().includes(query)
      );
    }

    return result;
  }, [eligibleRegistrations, filter, searchQuery]);

  const handleCheckIn = async (userId: string) => {
    try {
      await checkInMutation.mutateAsync({ eventId, userId });
      toast({
        title: "Checked In",
        description: "Athlete has been checked in successfully.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to check in athlete",
      });
    }
  };

  const isCheckedIn = (reg: RegistrationWithUser) => {
    return reg.checkedInAt || reg.status === "checked_in";
  };

  // Empty state - no registrations
  if (totalCount === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Check-In</CardTitle>
          <CardDescription>No approved registrations yet</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No registrations available for check-in</p>
            <p className="text-sm mt-1">Approved registrations will appear here</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Check-In</CardTitle>
        <CardDescription>
          {checkedInCount} of {totalCount} checked in ({progressPercentage}%)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-2">
          <Progress value={progressPercentage} className="h-3" />
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{waitingCount} waiting</span>
            <span>{checkedInCount} checked in</span>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search athletes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant={filter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("all")}
            >
              All ({totalCount})
            </Button>
            <Button
              variant={filter === "waiting" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("waiting")}
            >
              Waiting ({waitingCount})
            </Button>
            <Button
              variant={filter === "checked_in" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("checked_in")}
            >
              Checked In ({checkedInCount})
            </Button>
          </div>
        </div>

        {/* Athletes List */}
        <div className="space-y-2">
          {filteredRegistrations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No athletes found matching your search</p>
            </div>
          ) : (
            filteredRegistrations.map((reg) => (
              <div
                key={reg.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  isCheckedIn(reg) ? "bg-green-50 border-green-200" : "bg-background"
                }`}
              >
                <div className="flex items-center gap-3">
                  {isCheckedIn(reg) ? (
                    <div data-testid="checked-indicator">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    </div>
                  ) : (
                    <Clock className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div>
                    <p className="font-medium">{reg.userFullNameSnapshot}</p>
                    {isCheckedIn(reg) && reg.checkedInAt && (
                      <p className="text-sm text-muted-foreground">
                        Checked in at {format(new Date(reg.checkedInAt), "h:mm a")}
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  {isCheckedIn(reg) ? (
                    <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                      <UserCheck className="h-3 w-3 mr-1" />
                      Checked In
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleCheckIn(reg.userId)}
                      disabled={checkInMutation.isPending}
                    >
                      {checkInMutation.isPending ? "..." : "Check In"}
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default CheckInTab;
