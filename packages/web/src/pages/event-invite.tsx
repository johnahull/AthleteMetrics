/**
 * Event Invite Page - Accept an event invitation via token
 * Public page for accepting/declining event invitations
 */

import { useState } from "react";
import { useParams, Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { useInvitationByToken, useAcceptInvitation, useDeclineInvitation } from "@/lib/events-api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { EventStatusBadge } from "@/components/events";
import {
  Calendar,
  MapPin,
  Clock,
  CheckCircle,
  XCircle,
  Mail,
  LogIn,
  UserPlus,
  CalendarPlus,
} from "lucide-react";
import { format, formatDistanceToNow, isFuture, isPast } from "date-fns";

export default function EventInvite() {
  const { token } = useParams();
  const { user } = useAuth();
  const isAuthenticated = !!user;
  const { toast } = useToast();

  const [actionComplete, setActionComplete] = useState<"accepted" | "declined" | null>(null);

  // Fetch invitation by token
  const { data: invitation, isLoading, error } = useInvitationByToken(token);

  // Mutations
  const acceptMutation = useAcceptInvitation();
  const declineMutation = useDeclineInvitation();

  // Handle accept
  const handleAccept = async () => {
    if (!token) return;

    try {
      await acceptMutation.mutateAsync(token);
      setActionComplete("accepted");
      toast({
        title: "Invitation Accepted!",
        description: "You're now registered for this event.",
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err?.message || "Unable to accept invitation.",
      });
    }
  };

  // Handle decline
  const handleDecline = async () => {
    if (!token) return;

    try {
      await declineMutation.mutateAsync(token);
      setActionComplete("declined");
      toast({
        title: "Invitation Declined",
        description: "You've declined this invitation.",
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err?.message || "Unable to decline invitation.",
      });
    }
  };

  // Format date range
  const formatDateRange = () => {
    if (!invitation?.event) return "";
    const startDate = new Date(invitation.event.startDate);
    const endDate = invitation.event.endDate ? new Date(invitation.event.endDate) : null;

    if (!endDate || format(startDate, "yyyy-MM-dd") === format(endDate, "yyyy-MM-dd")) {
      return format(startDate, "EEEE, MMMM d, yyyy");
    }
    return `${format(startDate, "MMM d")} - ${format(endDate, "MMM d, yyyy")}`;
  };

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

  // Invalid or expired invitation
  if (error || !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <XCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
            <h2 className="text-lg font-semibold mb-2">Invalid Invitation</h2>
            <p className="text-muted-foreground mb-4">
              This invitation link is invalid, expired, or has already been used.
            </p>
            <Link href="/">
              <Button variant="outline">Go to Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Already used invitation
  if (invitation.status !== "pending") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            {invitation.status === "accepted" ? (
              <>
                <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                <h2 className="text-lg font-semibold mb-2">Already Accepted</h2>
                <p className="text-muted-foreground mb-4">
                  This invitation has already been accepted.
                </p>
              </>
            ) : (
              <>
                <XCircle className="h-12 w-12 mx-auto mb-4 text-gray-500" />
                <h2 className="text-lg font-semibold mb-2">Invitation {invitation.status}</h2>
                <p className="text-muted-foreground mb-4">
                  This invitation is no longer available.
                </p>
              </>
            )}
            <Link href="/my-events">
              <Button>View My Events</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check if expired
  const isExpired = invitation.expiresAt && isPast(new Date(invitation.expiresAt));
  if (isExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Clock className="h-12 w-12 mx-auto mb-4 text-orange-500" />
            <h2 className="text-lg font-semibold mb-2">Invitation Expired</h2>
            <p className="text-muted-foreground mb-4">
              This invitation has expired. Please contact the event organizer for a new invitation.
            </p>
            <Link href="/">
              <Button variant="outline">Go to Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Action complete view
  if (actionComplete) {
    const event = invitation.event;
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            {actionComplete === "accepted" ? (
              <>
                <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle className="h-10 w-10 text-green-600" />
                </div>
                <h2 className="text-xl font-semibold mb-2">You're Registered!</h2>
                {event && (
                  <>
                    <p className="text-lg font-medium mb-1">{event.name}</p>
                    <p className="text-muted-foreground mb-2">{formatDateRange()}</p>
                    {event.location && (
                      <p className="text-muted-foreground mb-4">
                        <MapPin className="h-4 w-4 inline mr-1" />
                        {event.location}
                      </p>
                    )}
                  </>
                )}
                <div className="space-y-2 mt-6">
                  <Button variant="outline" className="w-full">
                    <CalendarPlus className="h-4 w-4 mr-2" />
                    Add to Calendar
                  </Button>
                  <Link href="/my-events">
                    <Button className="w-full">View My Events</Button>
                  </Link>
                </div>
              </>
            ) : (
              <>
                <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                  <XCircle className="h-10 w-10 text-gray-600" />
                </div>
                <h2 className="text-xl font-semibold mb-2">Invitation Declined</h2>
                <p className="text-muted-foreground mb-6">
                  You've declined the invitation to this event.
                </p>
                <Link href="/">
                  <Button variant="outline">Go to Home</Button>
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main invitation view
  const event = invitation.event;
  const startDate = event ? new Date(event.startDate) : null;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="h-12 w-12 mx-auto mb-2 rounded-full bg-primary/10 flex items-center justify-center">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>You've Been Invited!</CardTitle>
          <CardDescription>
            You've been invited to participate in:
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Event Card */}
          {event && (
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <EventStatusBadge status={event.status} />
                {event.eventType && (
                  <Badge variant="outline" className="capitalize">
                    {event.eventType.replace("_", " ")}
                  </Badge>
                )}
              </div>
              <h3 className="text-lg font-semibold">{event.name}</h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>{formatDateRange()}</span>
                  {startDate && isFuture(startDate) && (
                    <span>({formatDistanceToNow(startDate)} from now)</span>
                  )}
                </div>
                {event.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    <span>{event.location}</span>
                  </div>
                )}
              </div>
              {event.description && (
                <p className="text-sm text-muted-foreground pt-2 border-t">
                  {event.description}
                </p>
              )}
            </div>
          )}

          {/* Invitation details */}
          <div className="text-sm text-muted-foreground text-center">
            <p>Invitation sent to: {invitation.email}</p>
            {invitation.expiresAt && (
              <p className="text-orange-600">
                Expires: {format(new Date(invitation.expiresAt), "MMM d, yyyy 'at' h:mm a")}
              </p>
            )}
          </div>

          {/* Action buttons */}
          {!isAuthenticated ? (
            <div className="space-y-4">
              <p className="text-sm text-center text-muted-foreground">
                Sign in or create an account to respond to this invitation.
              </p>
              <div className="flex gap-2">
                <Link href={`/login?redirect=/events/invite/${token}`} className="flex-1">
                  <Button variant="outline" className="w-full">
                    <LogIn className="h-4 w-4 mr-2" />
                    Sign In
                  </Button>
                </Link>
                <Link href={`/register?redirect=/events/invite/${token}`} className="flex-1">
                  <Button className="w-full">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Create Account
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleDecline}
                disabled={declineMutation.isPending || acceptMutation.isPending}
              >
                {declineMutation.isPending ? "..." : "Decline"}
              </Button>
              <Button
                className="flex-1"
                onClick={handleAccept}
                disabled={acceptMutation.isPending || declineMutation.isPending}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                {acceptMutation.isPending ? "Accepting..." : "Accept Invitation"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
