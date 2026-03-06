/**
 * Event Detail/Manage Page - Coach/Org Admin view
 * Tabs: Overview, Registrations, Check-In, Metrics, Results, Settings
 */

import { useState, useMemo } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Eye } from "lucide-react";
import {
  useEvent,
  useEventRegistrations,
  useEventInvitations,
  useFreezeEvent,
  useUnfreezeEvent,
  useApproveRegistration,
  useDeclineRegistration,
  useCancelInvitation,
  useCancelRegistration,
  useMyEventRegistration,
} from "@/lib/events-api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { EventStatusBadge, EventMetricsTab, EventResultsTab, EventReportsTab, CheckInTab, InviteAthletesModal } from "@/components/events";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Users,
  Clock,
  Copy,
  Lock,
  Unlock,
  Settings,
  ClipboardList,
  BarChart3,
  CheckCircle,
  Edit,
  ExternalLink,
} from "lucide-react";
import { format, formatDistanceToNow, isPast, isFuture } from "date-fns";
import type { EventRegistration, EventInvitation } from "@shared/schema";

type TabValue = "overview" | "registrations" | "checkin" | "metrics" | "results" | "reports" | "settings";

// Extended registration type with user data
interface RegistrationWithUser extends EventRegistration {
  user?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export default function EventDetail() {
  const { eventId } = useParams();
  const [, navigate] = useLocation();
  const { user, userOrganizations } = useAuth();
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState<TabValue>("overview");
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [declineDialog, setDeclineDialog] = useState<{ open: boolean; registrationId: string | null }>({ open: false, registrationId: null });
  const [declineReason, setDeclineReason] = useState("");
  const [cancelInvitationDialog, setCancelInvitationDialog] = useState<{ open: boolean; invitationId: string | null }>({ open: false, invitationId: null });
  const [cancelMyRegistrationDialog, setCancelMyRegistrationDialog] = useState(false);

  // Fetch event data
  const { data: event, isLoading: eventLoading, error: eventError } = useEvent(eventId);

  // Fetch registrations
  const { data: registrations, isLoading: registrationsLoading } = useEventRegistrations(eventId);

  // Fetch invitations
  const { data: invitations, isLoading: invitationsLoading } = useEventInvitations(eventId);

  // Mutations
  const freezeMutation = useFreezeEvent();
  const unfreezeMutation = useUnfreezeEvent();
  const approveMutation = useApproveRegistration();
  const declineMutation = useDeclineRegistration();
  const cancelInvitationMutation = useCancelInvitation();
  const cancelRegistrationMutation = useCancelRegistration();

  // Fetch athlete's own registration (for athlete view)
  const { data: myRegistration } = useMyEventRegistration(eventId);

  // Handle approve registration
  const handleApprove = async (registrationId: string) => {
    if (!eventId) return;
    try {
      await approveMutation.mutateAsync({ eventId, registrationId });
      toast({
        title: "Registration Approved",
        description: "Athlete has been approved for this event.",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to approve registration.",
      });
    }
  };

  // Handle decline registration - open dialog for reason
  const handleDecline = (registrationId: string) => {
    setDeclineDialog({ open: true, registrationId });
    setDeclineReason("");
  };

  // Confirm decline with reason
  const confirmDecline = async () => {
    if (!eventId || !declineDialog.registrationId) return;
    try {
      await declineMutation.mutateAsync({
        eventId,
        registrationId: declineDialog.registrationId,
        reason: declineReason.trim() || "Declined by admin",
      });
      toast({
        title: "Registration Declined",
        description: "Registration has been declined.",
      });
      setDeclineDialog({ open: false, registrationId: null });
      setDeclineReason("");
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to decline registration.",
      });
    }
  };

  // Handle cancel invitation - open dialog for confirmation
  const handleCancelInvitation = (invitationId: string) => {
    setCancelInvitationDialog({ open: true, invitationId });
  };

  // Confirm cancel invitation
  const confirmCancelInvitation = async () => {
    if (!eventId || !cancelInvitationDialog.invitationId) return;
    try {
      await cancelInvitationMutation.mutateAsync({
        eventId,
        invitationId: cancelInvitationDialog.invitationId,
      });
      toast({
        title: "Invitation Cancelled",
        description: "The invitation has been cancelled.",
      });
      setCancelInvitationDialog({ open: false, invitationId: null });
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to cancel invitation.",
      });
    }
  };

  // Handle athlete cancelling their own registration
  const handleCancelMyRegistration = async () => {
    if (!eventId || !myRegistration) return;
    try {
      await cancelRegistrationMutation.mutateAsync(eventId);
      toast({
        title: "Registration Cancelled",
        description: "You have cancelled your registration for this event.",
      });
      setCancelMyRegistrationDialog(false);
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to cancel registration.",
      });
    }
  };

  // Handle invite athletes (placeholder)
  const handleInviteAthletes = () => {
    setInviteModalOpen(true);
  };

  // Handle edit event - navigate to edit page
  const handleEditEvent = () => {
    navigate(`/events/${eventId}/edit`);
  };

  // Calculate stats
  const typedRegistrations = (registrations as RegistrationWithUser[]) || [];
  const approvedCount = typedRegistrations.filter((r) => r.status === "approved" || r.status === "checked_in").length;
  const checkedInCount = typedRegistrations.filter((r) => r.status === "checked_in").length;
  const waitlistCount = typedRegistrations.filter((r) => r.status === "waitlisted").length;
  const pendingCount = typedRegistrations.filter((r) => r.status === "pending").length;

  // Determine if user can manage this event (coach, org_admin, or site_admin)
  const canManageEvent = useMemo(() => {
    if (!event || !user) return false;
    if (user.isSiteAdmin) return true;
    if (!event.organizationId) return false;

    return userOrganizations?.some(
      (org) => org.organizationId === event.organizationId &&
               (org.role === "org_admin" || org.role === "coach")
    ) ?? false;
  }, [event, user, userOrganizations]);

  // Copy event code to clipboard
  const copyEventCode = () => {
    if (event?.eventCode) {
      navigator.clipboard.writeText(event.eventCode);
      toast({
        title: "Copied!",
        description: "Event code copied to clipboard",
      });
    }
  };

  // Copy join link to clipboard
  const copyJoinLink = () => {
    if (event?.eventCode) {
      const link = `${window.location.origin}/events/join/${event.eventCode}`;
      navigator.clipboard.writeText(link);
      toast({
        title: "Copied!",
        description: "Join link copied to clipboard",
      });
    }
  };

  // Handle freeze/unfreeze
  const handleToggleFreeze = async () => {
    if (!eventId) return;

    try {
      if (event?.isFrozen) {
        await unfreezeMutation.mutateAsync(eventId);
        toast({
          title: "Event Unfrozen",
          description: "Event has been unfrozen and can now be edited.",
        });
      } else {
        await freezeMutation.mutateAsync({ eventId, reason: "Manual freeze by admin" });
        toast({
          title: "Event Frozen",
          description: "Event has been frozen. No changes can be made until unfrozen.",
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update event freeze status.",
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

  // Time status
  const getTimeStatus = () => {
    if (!event) return null;
    const startDate = new Date(event.startDate);
    const endDate = event.endDate ? new Date(event.endDate) : startDate;

    if (isPast(endDate)) return { label: "Completed", variant: "secondary" as const };
    if (isFuture(startDate)) return { label: `In ${formatDistanceToNow(startDate)}`, variant: "default" as const };
    return { label: "In Progress", variant: "default" as const };
  };

  if (eventLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (eventError || !event) {
    return (
      <div className="p-6">
        <Card className="bg-red-50 border-red-200">
          <CardContent className="pt-6">
            <p className="text-red-800">Event not found or you don't have permission to view it.</p>
            <Link href="/events">
              <Button variant="outline" className="mt-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Events
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const timeStatus = getTimeStatus();

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <Link href="/events">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Events
          </Button>
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{event.name}</h1>
            <div className="flex items-center gap-3 mt-2">
              <EventStatusBadge status={event.status} />
              {event.isFrozen && (
                <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300">
                  <Lock className="h-3 w-3 mr-1" />
                  Frozen
                </Badge>
              )}
              {timeStatus && (
                <Badge variant={timeStatus.variant}>
                  <Clock className="h-3 w-3 mr-1" />
                  {timeStatus.label}
                </Badge>
              )}
            </div>
          </div>
          {canManageEvent && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleToggleFreeze} disabled={freezeMutation.isPending || unfreezeMutation.isPending}>
                {event.isFrozen ? (
                  <>
                    <Unlock className="h-4 w-4 mr-2" />
                    Unfreeze
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4 mr-2" />
                    Freeze
                  </>
                )}
              </Button>
              <Button onClick={handleEditEvent}>
                <Edit className="h-4 w-4 mr-2" />
                Edit Event
              </Button>
            </div>
          )}
        </div>

        {/* Event info bar */}
        <div className="flex flex-wrap gap-4 mt-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            <span>{formatDateRange()}</span>
          </div>
          {event.location && (
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              <span>{event.location}</span>
            </div>
          )}
          {event.eventCode && (
            <div className="flex items-center gap-2">
              <span className="font-mono bg-muted px-2 py-0.5 rounded">
                Code: {event.eventCode}
              </span>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={copyEventCode}>
                <Copy className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={copyJoinLink}>
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={selectedTab} onValueChange={(v) => setSelectedTab(v as TabValue)} className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">
            Overview
          </TabsTrigger>
          {canManageEvent && (
            <>
              <TabsTrigger value="registrations" data-testid="tab-registrations">
                Registrations ({approvedCount + pendingCount}
                {invitations && invitations.length > 0 && ` + ${invitations.length} pending invitations`})
              </TabsTrigger>
              <TabsTrigger value="checkin" data-testid="tab-checkin">
                Check-In ({checkedInCount}/{approvedCount})
              </TabsTrigger>
              <TabsTrigger value="metrics" data-testid="tab-metrics">
                Metrics
              </TabsTrigger>
              <TabsTrigger value="results" data-testid="tab-results">
                Results
              </TabsTrigger>
              <TabsTrigger value="reports" data-testid="tab-reports">
                Reports
              </TabsTrigger>
              <TabsTrigger value="settings" data-testid="tab-settings">
                Settings
              </TabsTrigger>
            </>
          )}
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="space-y-6">
            {/* Stats Cards - Admin Only */}
            {canManageEvent && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-100 rounded-lg">
                        <Users className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{approvedCount}</p>
                        <p className="text-sm text-muted-foreground">
                          Registered
                          {event.maxRegistrations && ` / ${event.maxRegistrations}`}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <CheckCircle className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{checkedInCount}</p>
                        <p className="text-sm text-muted-foreground">Checked In</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-yellow-100 rounded-lg">
                        <Clock className="h-5 w-5 text-yellow-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{pendingCount}</p>
                        <p className="text-sm text-muted-foreground">Pending</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-orange-100 rounded-lg">
                        <ClipboardList className="h-5 w-5 text-orange-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{waitlistCount}</p>
                        <p className="text-sm text-muted-foreground">Waitlisted</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Description */}
            {event.description && (
              <Card>
                <CardHeader>
                  <CardTitle>About This Event</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground whitespace-pre-wrap">{event.description}</p>
                </CardContent>
              </Card>
            )}

            {/* Quick Actions - for coaches/admins */}
            {canManageEvent && (
              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                  <CardDescription>Common tasks for managing this event</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3">
                  <Button variant="outline" onClick={() => setSelectedTab("registrations")}>
                    <Users className="h-4 w-4 mr-2" />
                    View Registrations
                  </Button>
                  <Button variant="outline" onClick={() => setSelectedTab("checkin")}>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Start Check-In
                  </Button>
                  <Button variant="outline" onClick={() => setSelectedTab("metrics")}>
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Configure Metrics
                  </Button>
                  <Button variant="outline" onClick={copyJoinLink}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Join Link
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Athlete Registration Status - for non-managers */}
            {!canManageEvent && myRegistration && (
              <Card>
                <CardHeader>
                  <CardTitle>Your Registration</CardTitle>
                  <CardDescription>Your status for this event</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={
                        myRegistration.status === 'approved' ? 'default' :
                        myRegistration.status === 'checked_in' ? 'default' :
                        myRegistration.status === 'pending' ? 'secondary' :
                        myRegistration.status === 'waitlisted' ? 'secondary' :
                        'destructive'
                      }
                      className={
                        myRegistration.status === 'approved' ? 'bg-green-100 text-green-800' :
                        myRegistration.status === 'checked_in' ? 'bg-blue-100 text-blue-800' :
                        myRegistration.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        myRegistration.status === 'waitlisted' ? 'bg-orange-100 text-orange-800' :
                        ''
                      }
                    >
                      {myRegistration.status === 'approved' && '✓ Registered'}
                      {myRegistration.status === 'checked_in' && '✓ Checked In'}
                      {myRegistration.status === 'pending' && '⏳ Pending Approval'}
                      {myRegistration.status === 'waitlisted' && '📋 Waitlisted'}
                      {myRegistration.status === 'declined' && '✗ Declined'}
                      {myRegistration.status === 'cancelled' && '✗ Cancelled'}
                    </Badge>
                    {myRegistration.checkedInAt && (
                      <span className="text-sm text-muted-foreground">
                        Checked in at {format(new Date(myRegistration.checkedInAt), 'h:mm a')}
                      </span>
                    )}
                  </div>
                  {/* Cancel button - only show if not already checked in or cancelled/declined */}
                  {!['checked_in', 'cancelled', 'declined'].includes(myRegistration.status) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setCancelMyRegistrationDialog(true)}
                    >
                      Cancel Registration
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Athlete Results - for non-managers when results published */}
            {!canManageEvent && event.resultsPublishedAt && (
              <Card>
                <CardHeader>
                  <CardTitle>Your Results</CardTitle>
                  <CardDescription>View your performance data from this event</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link href={`/events/${eventId}/results`}>
                    <Button>
                      <Eye className="h-4 w-4 mr-2" />
                      View My Results
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Registrations Tab - Admin Only */}
        {canManageEvent && (
        <TabsContent value="registrations">
          {/* Pending Invitations Section */}
          {invitations && invitations.length > 0 && (
            <Card className="mb-4 border-amber-200 bg-amber-50/30">
              <CardHeader>
                <CardTitle className="text-amber-900">Pending Invitations</CardTitle>
                <CardDescription className="text-amber-700">
                  {invitations.length} {invitations.length === 1 ? 'invitation' : 'invitations'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {invitationsLoading ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {invitations.map((invitation) => {
                      const expiresAt = new Date(invitation.expiresAt);
                      const createdAt = new Date(invitation.createdAt);
                      const expiresInDays = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                      const showExpirationWarning = expiresInDays <= 7 && invitation.status === 'pending';

                      // Get invitee display name - for tests, we'll mock this
                      // In real app, we'd need to fetch user data or include it in the invitation response
                      const inviteeName = invitation.userId
                        ? `User ${invitation.userId.slice(0, 8)}...` // Placeholder - will be replaced with actual user lookup
                        : invitation.email;

                      return (
                        <div
                          key={invitation.id}
                          className="flex items-center justify-between p-3 border border-amber-200 rounded-lg bg-white"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center">
                              <span className="text-sm font-medium text-amber-800">
                                {inviteeName?.charAt(0)?.toUpperCase() || "?"}
                              </span>
                            </div>
                            <div className="flex-1">
                              <p className="font-medium">{inviteeName}</p>
                              <p className="text-sm text-muted-foreground">
                                Invited {formatDistanceToNow(createdAt, { addSuffix: true })}
                                {invitation.invitedBy && ` by Coach ${invitation.invitedBy.slice(0, 8)}...`}
                              </p>
                              {showExpirationWarning && (
                                <p className="text-xs text-amber-600 mt-1">
                                  Expires in {expiresInDays} {expiresInDays === 1 ? 'day' : 'days'}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={
                                invitation.status === "pending"
                                  ? "bg-amber-100 text-amber-700 border-amber-300"
                                  : invitation.status === "declined"
                                  ? "bg-red-100 text-red-700 border-red-300"
                                  : invitation.status === "cancelled"
                                  ? "bg-gray-100 text-gray-700 border-gray-300"
                                  : invitation.status === "accepted"
                                  ? "bg-green-100 text-green-700 border-green-300"
                                  : "bg-gray-100 text-gray-700"
                              }
                            >
                              {invitation.status.charAt(0).toUpperCase() + invitation.status.slice(1)}
                            </Badge>
                            {invitation.status === "pending" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleCancelInvitation(invitation.id)}
                                disabled={cancelInvitationMutation.isPending}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                Cancel
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Registrations</CardTitle>
                  <CardDescription>
                    {approvedCount + pendingCount + waitlistCount} total registrations
                  </CardDescription>
                </div>
                <Button onClick={handleInviteAthletes}>Invite Athletes</Button>
              </div>
            </CardHeader>
            <CardContent>
              {registrationsLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : typedRegistrations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No registrations yet</p>
                  <p className="text-sm mt-1">Share the event code to get athletes registered</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {typedRegistrations.map((reg) => (
                    <div
                      key={reg.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-sm font-medium">
                            {reg.userFullNameSnapshot?.charAt(0) || "?"}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium">{reg.userFullNameSnapshot}</p>
                          <p className="text-sm text-muted-foreground">
                            {reg.organizationNameSnapshot || "Independent"}
                            {reg.registrationNumber && ` • #${reg.registrationNumber}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={
                            reg.status === "approved"
                              ? "bg-green-100 text-green-700"
                              : reg.status === "pending"
                              ? "bg-yellow-100 text-yellow-700"
                              : reg.status === "waitlisted"
                              ? "bg-orange-100 text-orange-700"
                              : reg.status === "checked_in"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-gray-100 text-gray-700"
                          }
                        >
                          {reg.status}
                        </Badge>
                        {reg.status === "pending" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleApprove(reg.id)}
                              disabled={approveMutation.isPending}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDecline(reg.id)}
                              disabled={declineMutation.isPending}
                            >
                              Decline
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        )}

        {/* Check-In Tab - Admin Only */}
        {canManageEvent && (
        <TabsContent value="checkin">
          <CheckInTab
            eventId={eventId!}
            registrations={typedRegistrations}
          />
        </TabsContent>
        )}

        {/* Metrics Tab - Admin Only */}
        {canManageEvent && (
        <TabsContent value="metrics">
          <EventMetricsTab
            eventId={eventId!}
            organizationId={event.organizationId || undefined}
            isFrozen={event.isFrozen}
          />
        </TabsContent>
        )}

        {/* Results Tab - Admin Only */}
        {canManageEvent && (
        <TabsContent value="results">
          <EventResultsTab
            eventId={eventId!}
            organizationId={event.organizationId || undefined}
            isFrozen={event.isFrozen}
            eventStatus={event.status}
            resultsPublishedAt={event.resultsPublishedAt}
          />
        </TabsContent>
        )}

        {/* Reports Tab - Admin Only */}
        {canManageEvent && (
        <TabsContent value="reports">
          <EventReportsTab
            eventId={eventId!}
            eventName={event.name}
            isFrozen={event.isFrozen}
          />
        </TabsContent>
        )}

        {/* Settings Tab - Admin Only */}
        {canManageEvent && (
        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Event Settings</CardTitle>
              <CardDescription>Configure event details and options</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium">Visibility</p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {event.visibility?.replace("_", " ") || "Organization Only"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Registration Mode</p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {event.registrationMode?.replace("_", " ") || "Open"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Max Capacity</p>
                    <p className="text-sm text-muted-foreground">
                      {event.maxRegistrations || "Unlimited"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Results Visibility</p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {event.resultsVisibility?.replace("_", " ") || "After Event"}
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <Button variant="outline" onClick={handleEditEvent}>
                    <Settings className="h-4 w-4 mr-2" />
                    Edit Settings
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        )}
      </Tabs>

      {/* Invite Athletes Modal */}
      <InviteAthletesModal
        eventId={eventId!}
        eventName={event.name}
        organizationId={event.organizationId || ""}
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
      />

      {/* Decline Reason Dialog */}
      <Dialog
        open={declineDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setDeclineDialog({ open: false, registrationId: null });
            setDeclineReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline Registration</DialogTitle>
            <DialogDescription>
              Provide an optional reason for declining this registration. The athlete will be notified.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for declining (optional)"
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeclineDialog({ open: false, registrationId: null });
                setDeclineReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDecline}
              disabled={declineMutation.isPending}
            >
              {declineMutation.isPending ? "Declining..." : "Decline Registration"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Invitation Dialog */}
      <Dialog
        open={cancelInvitationDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setCancelInvitationDialog({ open: false, invitationId: null });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Invitation</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this invitation? The invitee will no longer be able to accept it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelInvitationDialog({ open: false, invitationId: null })}
            >
              No, Keep It
            </Button>
            <Button
              variant="destructive"
              onClick={confirmCancelInvitation}
              disabled={cancelInvitationMutation.isPending}
            >
              {cancelInvitationMutation.isPending ? "Cancelling..." : "Cancel Invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel My Registration Dialog (for athletes) */}
      <Dialog
        open={cancelMyRegistrationDialog}
        onOpenChange={setCancelMyRegistrationDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Registration</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel your registration for this event? You may need to re-register if you change your mind.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelMyRegistrationDialog(false)}
            >
              No, Keep It
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelMyRegistration}
              disabled={cancelRegistrationMutation.isPending}
            >
              {cancelRegistrationMutation.isPending ? "Cancelling..." : "Yes, Cancel Registration"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
