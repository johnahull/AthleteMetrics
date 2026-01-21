/**
 * Events - Coach/Org Admin event management page
 * Lists all events for the organization with tabs for different views
 */

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useEvents } from "@/lib/events-api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Calendar, Users, Clock, BarChart3 } from "lucide-react";
import { EventCard } from "@/components/events";
import type { EventWithCounts } from "@/lib/events-api";
import { isFuture, isPast } from "date-fns";

type TabValue = "overview" | "upcoming" | "past" | "drafts";

export default function Events() {
  const { organizationContext, userOrganizations, user } = useAuth();
  const [selectedTab, setSelectedTab] = useState<TabValue>("overview");

  // Get effective organization ID
  const getEffectiveOrganizationId = () => {
    if (organizationContext) return organizationContext;
    const isSiteAdmin = user?.isSiteAdmin || false;
    if (!isSiteAdmin && Array.isArray(userOrganizations) && userOrganizations.length > 0) {
      return userOrganizations[0].organizationId;
    }
    return null;
  };

  const effectiveOrganizationId = getEffectiveOrganizationId();

  // Fetch events
  const { data: events, isLoading } = useEvents(effectiveOrganizationId || undefined);

  // Filter events by status
  const upcomingEvents = events?.filter(
    (e) => e.status !== "draft" && e.status !== "cancelled" && isFuture(new Date(e.startDate))
  ) || [];

  const pastEvents = events?.filter(
    (e) => e.status !== "draft" && isPast(new Date(e.endDate || e.startDate))
  ) || [];

  const draftEvents = events?.filter((e) => e.status === "draft") || [];

  // Calculate summary stats
  const totalRegistrations = events?.reduce((sum, e) => sum + (e.registrationCount || 0), 0) || 0;
  const activeEvents = upcomingEvents.length;

  if (!effectiveOrganizationId) {
    return (
      <div className="p-6">
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="pt-6">
            <p className="text-yellow-800">
              Please select an organization to manage events.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleManageEvent = (event: EventWithCounts) => {
    // Navigate to event detail page
    window.location.href = `/events/${event.id}`;
  };

  const handleCreateEvent = () => {
    // Navigate to create event page
    window.location.href = "/events/new";
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Events</h1>
        <Button onClick={handleCreateEvent} data-testid="create-event-button">
          <Plus className="h-4 w-4 mr-2" />
          Create Event
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={selectedTab} onValueChange={(v) => setSelectedTab(v as TabValue)} className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">
            Overview
          </TabsTrigger>
          <TabsTrigger value="upcoming" data-testid="tab-upcoming">
            Upcoming ({upcomingEvents.length})
          </TabsTrigger>
          <TabsTrigger value="past" data-testid="tab-past">
            Past ({pastEvents.length})
          </TabsTrigger>
          <TabsTrigger value="drafts" data-testid="tab-drafts">
            Drafts ({draftEvents.length})
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Calendar className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{activeEvents}</p>
                      <p className="text-sm text-muted-foreground">Active Events</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <Users className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{totalRegistrations}</p>
                      <p className="text-sm text-muted-foreground">Total Registrations</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <Clock className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{pastEvents.length}</p>
                      <p className="text-sm text-muted-foreground">Completed</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <BarChart3 className="h-5 w-5 text-gray-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{draftEvents.length}</p>
                      <p className="text-sm text-muted-foreground">Drafts</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Upcoming Events Preview */}
            {upcomingEvents.length > 0 && (
              <div>
                <h2 className="text-lg font-medium mb-4">Upcoming Events</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {upcomingEvents.slice(0, 3).map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      onManage={handleManageEvent}
                    />
                  ))}
                </div>
                {upcomingEvents.length > 3 && (
                  <div className="mt-4 text-center">
                    <Button
                      variant="outline"
                      onClick={() => setSelectedTab("upcoming")}
                    >
                      View all {upcomingEvents.length} upcoming events
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Empty State */}
            {!isLoading && events?.length === 0 && (
              <Card className="bg-gray-50 border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Calendar className="h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-gray-600 text-center mb-4">
                    No events yet. Create your first event to get started.
                  </p>
                  <Button onClick={handleCreateEvent}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Event
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Upcoming Events Tab */}
        <TabsContent value="upcoming">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          ) : upcomingEvents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {upcomingEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onManage={handleManageEvent}
                />
              ))}
            </div>
          ) : (
            <Card className="bg-gray-50 border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-gray-600 text-center mb-4">
                  No upcoming events scheduled.
                </p>
                <Button onClick={handleCreateEvent}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Event
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Past Events Tab */}
        <TabsContent value="past">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          ) : pastEvents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pastEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  showManageButton={false}
                />
              ))}
            </div>
          ) : (
            <Card className="bg-gray-50 border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-gray-600 text-center">
                  No past events yet.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Drafts Tab */}
        <TabsContent value="drafts">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          ) : draftEvents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {draftEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onManage={handleManageEvent}
                />
              ))}
            </div>
          ) : (
            <Card className="bg-gray-50 border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-gray-600 text-center mb-4">
                  No draft events.
                </p>
                <Button onClick={handleCreateEvent}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Event
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
