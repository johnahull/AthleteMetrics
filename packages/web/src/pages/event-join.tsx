/**
 * Event Join Page - Join an event via event code
 * Public page that shows event details and allows registration
 */

import { useState } from "react";
import { useParams, Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { useEventByCode, useRegisterForEvent } from "@/lib/events-api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { EventStatusBadge } from "@/components/events";
import {
  Calendar,
  MapPin,
  Users,
  Clock,
  CheckCircle,
  Search,
  LogIn,
  UserPlus,
  CalendarPlus,
} from "lucide-react";
import { format, formatDistanceToNow, isFuture, isPast } from "date-fns";

export default function EventJoin() {
  const { code } = useParams();
  const { user } = useAuth();
  const isAuthenticated = !!user;
  const { toast } = useToast();

  const [eventCode, setEventCode] = useState(code || "");
  const [searchCode, setSearchCode] = useState(code || "");
  const [athleteNotes, setAthleteNotes] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [registrationNumber, setRegistrationNumber] = useState<number | null>(null);

  // Fetch event by code
  const { data: event, isLoading, error, refetch } = useEventByCode(searchCode);

  // Registration mutation
  const registerMutation = useRegisterForEvent();

  // Handle code lookup
  const handleLookup = () => {
    if (eventCode.trim()) {
      setSearchCode(eventCode.trim().toUpperCase());
    }
  };

  // Handle registration
  const handleRegister = async () => {
    if (!event || !isAuthenticated) return;

    try {
      const result = await registerMutation.mutateAsync({
        eventId: event.id,
        athleteNotes,
      });

      setRegistrationComplete(true);
      setRegistrationNumber(result.registrationNumber || null);

      toast({
        title: "Registration Successful!",
        description: event.registrationMode === "request_approval"
          ? "Your registration is pending approval."
          : "You're registered for this event.",
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Registration Failed",
        description: err?.message || "Unable to register for this event.",
      });
    }
  };

  // Format date range
  const formatDateRange = () => {
    if (!event) return "";
    const startDate = new Date(event.startDate);
    const endDate = event.endDate ? new Date(event.endDate) : null;

    if (!endDate || format(startDate, "yyyy-MM-dd") === format(endDate, "yyyy-MM-dd")) {
      return format(startDate, "EEEE, MMMM d, yyyy");
    }
    return `${format(startDate, "MMM d")} - ${format(endDate, "MMM d, yyyy")}`;
  };

  // Check registration status
  const isRegistrationOpen = () => {
    if (!event) return false;
    if (event.status === "cancelled") return false;

    const now = new Date();
    if (event.registrationOpensAt && new Date(event.registrationOpensAt) > now) return false;
    if (event.registrationClosesAt && new Date(event.registrationClosesAt) < now) return false;

    const startDate = new Date(event.startDate);
    if (isPast(startDate)) return false;

    return true;
  };

  // Check capacity
  const hasCapacity = () => {
    if (!event) return false;
    if (!event.maxRegistrations) return true;
    return (event.registrationCount || 0) < event.maxRegistrations;
  };

  // Code lookup form (when no code in URL)
  if (!searchCode) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Calendar className="h-12 w-12 mx-auto mb-4 text-primary" />
            <CardTitle>Join an Event</CardTitle>
            <CardDescription>Enter your event code to get started</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="eventCode">Event Code</Label>
              <Input
                id="eventCode"
                value={eventCode}
                onChange={(e) => setEventCode(e.target.value.toUpperCase())}
                placeholder="Enter code (e.g., SPRNG25A)"
                className="font-mono text-center text-lg"
                maxLength={20}
              />
            </div>
            <Button onClick={handleLookup} className="w-full" disabled={!eventCode.trim()}>
              <Search className="h-4 w-4 mr-2" />
              Look Up Event
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <Card className="w-full max-w-lg">
          <CardContent className="pt-6 space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Event not found
  if (error || !event) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h2 className="text-lg font-semibold mb-2">Event Not Found</h2>
            <p className="text-muted-foreground mb-4">
              The event code "{searchCode}" doesn't match any active events.
            </p>
            <Button variant="outline" onClick={() => setSearchCode("")}>
              Try Another Code
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Registration complete view
  if (registrationComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold mb-2">You're Registered!</h2>
            <p className="text-lg font-medium mb-1">{event.name}</p>
            <p className="text-muted-foreground mb-2">{formatDateRange()}</p>
            {event.location && (
              <p className="text-muted-foreground mb-4">
                <MapPin className="h-4 w-4 inline mr-1" />
                {event.location}
              </p>
            )}
            {registrationNumber && (
              <p className="text-sm text-muted-foreground mb-4">
                Registration #: {registrationNumber}
              </p>
            )}
            <Badge
              variant="outline"
              className={
                event.registrationMode === "request_approval"
                  ? "bg-yellow-100 text-yellow-700 mb-4"
                  : "bg-green-100 text-green-700 mb-4"
              }
            >
              {event.registrationMode === "request_approval" ? "Pending Approval" : "Confirmed"}
            </Badge>
            <div className="space-y-2 mt-6">
              <Button variant="outline" className="w-full">
                <CalendarPlus className="h-4 w-4 mr-2" />
                Add to Calendar
              </Button>
              <Link href="/my-events">
                <Button variant="default" className="w-full">
                  View My Events
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Event details view
  const startDate = new Date(event.startDate);
  const registrationOpen = isRegistrationOpen();
  const spotsAvailable = hasCapacity();
  const spotsRemaining = event.maxRegistrations
    ? event.maxRegistrations - (event.registrationCount || 0)
    : null;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="flex items-center gap-2 mb-2">
            <EventStatusBadge status={event.status} />
            {event.eventType && (
              <Badge variant="outline" className="capitalize">
                {event.eventType.replace("_", " ")}
              </Badge>
            )}
          </div>
          <CardTitle className="text-xl">{event.name}</CardTitle>
          {event.organizationId && (
            <CardDescription>Organization Event</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Event Details */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>{formatDateRange()}</span>
              {isFuture(startDate) && (
                <span className="text-muted-foreground">
                  ({formatDistanceToNow(startDate)} from now)
                </span>
              )}
            </div>
            {event.location && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>{event.location}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span>
                {event.registrationCount || 0} registered
                {spotsRemaining !== null && ` • ${spotsRemaining} spots remaining`}
              </span>
            </div>
          </div>

          {/* Description */}
          {event.description && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm whitespace-pre-wrap">{event.description}</p>
            </div>
          )}

          {/* Registration Section */}
          {!isAuthenticated ? (
            // Not logged in
            <div className="border rounded-lg p-4 space-y-4">
              <p className="text-sm text-center text-muted-foreground">
                To register for this event, please sign in or create an account.
              </p>
              <div className="flex gap-2">
                <Link href={`/login?redirect=/events/join/${searchCode}`} className="flex-1">
                  <Button variant="outline" className="w-full">
                    <LogIn className="h-4 w-4 mr-2" />
                    Sign In
                  </Button>
                </Link>
                <Link href={`/register?redirect=/events/join/${searchCode}`} className="flex-1">
                  <Button className="w-full">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Create Account
                  </Button>
                </Link>
              </div>
            </div>
          ) : !registrationOpen ? (
            // Registration closed
            <div className="border rounded-lg p-4 text-center">
              <Clock className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="font-medium">Registration Closed</p>
              <p className="text-sm text-muted-foreground">
                {isPast(startDate)
                  ? "This event has already started."
                  : "Registration is not currently open."}
              </p>
            </div>
          ) : !spotsAvailable ? (
            // Event full
            <div className="border rounded-lg p-4 text-center">
              <Users className="h-8 w-8 mx-auto mb-2 text-orange-500" />
              <p className="font-medium">Event Full</p>
              <p className="text-sm text-muted-foreground">
                This event has reached capacity. You may be added to the waitlist.
              </p>
              <Button className="mt-4" onClick={handleRegister} disabled={registerMutation.isPending}>
                {registerMutation.isPending ? "Joining..." : "Join Waitlist"}
              </Button>
            </div>
          ) : (
            // Registration form
            <div className="border rounded-lg p-4 space-y-4">
              <div>
                <p className="text-sm font-medium mb-1">Registering as:</p>
                <p className="text-sm">
                  {user?.firstName} {user?.lastName}
                </p>
              </div>

              <div>
                <Label htmlFor="notes">Notes for organizer (optional)</Label>
                <Textarea
                  id="notes"
                  value={athleteNotes}
                  onChange={(e) => setAthleteNotes(e.target.value)}
                  placeholder="Any information the organizer should know..."
                  rows={3}
                />
              </div>

              <div className="flex items-start gap-2">
                <Checkbox
                  id="terms"
                  checked={acceptedTerms}
                  onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
                />
                <label htmlFor="terms" className="text-sm text-muted-foreground">
                  I understand this event may include performance testing and I'm ready to participate.
                </label>
              </div>

              <Button
                className="w-full"
                onClick={handleRegister}
                disabled={!acceptedTerms || registerMutation.isPending}
              >
                {registerMutation.isPending ? "Registering..." : "Register for Event"}
              </Button>

              {event.registrationMode === "request_approval" && (
                <p className="text-xs text-center text-muted-foreground">
                  Registration requires approval from the event organizer.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
