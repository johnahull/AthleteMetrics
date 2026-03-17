/**
 * EventResultsTab - Manage event results visibility and publishing
 * Allows publishing/unpublishing results and changing visibility mode
 */

import { Link } from "wouter";
import { DeviceImportButton } from "@/components/device-import";
import {
  useResultsVisibilityStatus,
  usePublishResults,
  useUnpublishResults,
  useUpdateResultsVisibility,
} from "@/lib/events-api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart3,
  Lock,
  AlertCircle,
  Eye,
  EyeOff,
  Clock,
  CheckCircle,
  Calendar,
} from "lucide-react";
import { format } from "date-fns";

interface EventResultsTabProps {
  eventId: string;
  organizationId?: string;
  eventType?: string | null;
  isFrozen?: boolean;
  eventStatus?: string;
  resultsPublishedAt?: string | Date | null;
}

type ResultsVisibilityMode = 'immediate' | 'after_event' | 'manual';

const visibilityLabels: Record<ResultsVisibilityMode, { label: string; description: string }> = {
  immediate: {
    label: "Immediate",
    description: "Results visible to athletes as soon as recorded",
  },
  after_event: {
    label: "After Event",
    description: "Results visible when event status is 'Completed'",
  },
  manual: {
    label: "Manual Publish",
    description: "Results only visible after explicit publishing",
  },
};

export function EventResultsTab({
  eventId,
  organizationId,
  eventType,
  isFrozen = false,
  eventStatus,
  resultsPublishedAt,
}: EventResultsTabProps) {
  const { toast } = useToast();

  // Fetch results visibility status
  const { data: visibilityStatus, isLoading } = useResultsVisibilityStatus(eventId);

  // Mutations
  const publishResults = usePublishResults();
  const unpublishResults = useUnpublishResults();
  const updateVisibility = useUpdateResultsVisibility();

  // Handle publish
  const handlePublish = async () => {
    try {
      await publishResults.mutateAsync(eventId);
      toast({
        title: "Results Published",
        description: "Event results are now visible to all participants.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to publish results.",
      });
    }
  };

  // Handle unpublish
  const handleUnpublish = async () => {
    try {
      await unpublishResults.mutateAsync(eventId);
      toast({
        title: "Results Unpublished",
        description: "Event results are no longer visible to participants.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to unpublish results.",
      });
    }
  };

  // Handle visibility mode change
  const handleVisibilityChange = async (value: string) => {
    try {
      await updateVisibility.mutateAsync({
        eventId,
        visibility: value as ResultsVisibilityMode,
      });
      toast({
        title: "Visibility Updated",
        description: `Results visibility changed to "${visibilityLabels[value as ResultsVisibilityMode].label}".`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update visibility.",
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Results</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  const isPublished = visibilityStatus?.isPublished || false;
  const visibility = (visibilityStatus?.visibility || 'manual') as ResultsVisibilityMode;
  const publishedAt = visibilityStatus?.publishedAt || resultsPublishedAt;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Results
              {isFrozen && (
                <Badge variant="outline" className="ml-2 bg-blue-100 text-blue-700">
                  <Lock className="h-3 w-3 mr-1" />
                  Frozen
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {isPublished
                ? `Published ${publishedAt ? format(new Date(publishedAt), "MMM d, yyyy 'at' h:mm a") : ""}`
                : "Results not yet published"}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isFrozen && (
          <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg text-blue-700">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">
              This event is frozen. Results settings cannot be modified.
            </span>
          </div>
        )}

        {/* Publishing Status Card */}
        <div className={`p-4 rounded-lg border ${isPublished ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${isPublished ? "bg-green-100" : "bg-gray-200"}`}>
                {isPublished ? (
                  <Eye className="h-5 w-5 text-green-600" />
                ) : (
                  <EyeOff className="h-5 w-5 text-gray-500" />
                )}
              </div>
              <div>
                <p className="font-medium">
                  {isPublished ? "Results are Published" : "Results are Not Published"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isPublished
                    ? "Participants can view their results based on visibility settings."
                    : "Participants cannot see results until you publish them."}
                </p>
              </div>
            </div>
            {!isFrozen && (
              <Button
                variant={isPublished ? "outline" : "default"}
                onClick={isPublished ? handleUnpublish : handlePublish}
                disabled={publishResults.isPending || unpublishResults.isPending}
              >
                {isPublished ? (
                  <>
                    <EyeOff className="h-4 w-4 mr-2" />
                    Unpublish
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4 mr-2" />
                    Publish Results
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Visibility Mode Selector */}
        <div className="space-y-3">
          <label className="text-sm font-medium">Results Visibility Mode</label>
          <Select
            value={visibility}
            onValueChange={handleVisibilityChange}
            disabled={isFrozen || updateVisibility.isPending}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(visibilityLabels) as [ResultsVisibilityMode, typeof visibilityLabels[ResultsVisibilityMode]][]).map(
                ([value, { label, description }]) => (
                  <SelectItem key={value} value={value}>
                    <div className="flex flex-col">
                      <span>{label}</span>
                      <span className="text-xs text-muted-foreground">{description}</span>
                    </div>
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            {visibilityLabels[visibility].description}
          </p>
        </div>

        {/* Visibility Logic Explanation */}
        <div className="space-y-3 pt-4 border-t">
          <h4 className="text-sm font-medium">How Visibility Works</h4>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 mt-0.5 text-green-600" />
              <span>Coaches and org admins always see all results</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 mt-0.5 text-green-600" />
              <span>Athletes can always see their own results</span>
            </div>
            <div className="flex items-start gap-2">
              <Clock className="h-4 w-4 mt-0.5 text-blue-600" />
              <span>
                <strong>Immediate:</strong> All participants see all results in real-time
              </span>
            </div>
            <div className="flex items-start gap-2">
              <Calendar className="h-4 w-4 mt-0.5 text-yellow-600" />
              <span>
                <strong>After Event:</strong> Full results visible when event status is "Completed"
              </span>
            </div>
            <div className="flex items-start gap-2">
              <Eye className="h-4 w-4 mt-0.5 text-purple-600" />
              <span>
                <strong>Manual:</strong> Full results only visible after you click "Publish"
              </span>
            </div>
          </div>
        </div>

        {/* Event Status Info */}
        {visibility === "after_event" && (
          <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
            <div className="flex items-center gap-2 text-yellow-700">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">
                Event status: <strong className="capitalize">{eventStatus || visibilityStatus?.eventStatus || "Unknown"}</strong>
                {(eventStatus === "completed" || visibilityStatus?.eventStatus === "completed") ? (
                  " - Results are visible to all participants"
                ) : (
                  " - Results will be visible when event is completed"
                )}
              </span>
            </div>
          </div>
        )}

        {/* Data Entry Link */}
        <div className="pt-4 border-t">
          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-primary/10">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">Data Entry</p>
                <p className="text-sm text-muted-foreground">
                  Record measurements for event participants.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {organizationId && (
                <DeviceImportButton
                  organizationId={organizationId}
                  eventId={eventId}
                  eventType={eventType ?? undefined}
                  isFrozen={isFrozen}
                />
              )}
              {isFrozen ? (
                <Button variant="outline" disabled>
                  Enter Data
                </Button>
              ) : (
                <Link href={`/events/${eventId}/data-entry`}>
                  <Button variant="outline">
                    Enter Data
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default EventResultsTab;
