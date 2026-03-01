/**
 * Training Athlete Detail Page (Coach / Org Admin)
 * Route: /training/athletes/:athleteId
 *
 * Athlete name, AthleteScheduleView for their assignment.
 */

import { useLocation, useParams, Link } from "wouter";
import { useEffect } from "react";
import { Dumbbell, ArrowLeft, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTrainingAccess } from "@/hooks/use-training-access";
import { useTrainingAssignments } from "@/hooks/useAthleteProgram";
import { AthleteScheduleView } from "@/components/training/AthleteScheduleView";
import { useQuery } from "@tanstack/react-query";
import type { User as UserType } from "@shared/schema";

export default function TrainingAthleteDetailPage() {
  const { isEnabled, isLoading, organizationId } = useTrainingAccess();
  const [, navigate] = useLocation();
  const params = useParams<{ athleteId: string }>();
  const athleteId = params.athleteId;

  useEffect(() => {
    if (!isLoading && !isEnabled) {
      navigate("/");
    }
  }, [isEnabled, isLoading, navigate]);

  const { data: assignments = [], isLoading: assignmentsLoading } = useTrainingAssignments(organizationId);

  // Get the athlete's user info
  const { data: athlete } = useQuery<UserType | null>({
    queryKey: ["/api/users", athleteId],
    queryFn: async () => {
      if (!athleteId) return null;
      const response = await fetch(`/api/users/${athleteId}`, { credentials: "include" });
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!athleteId,
  });

  if (isLoading || !isEnabled) return null;

  const athleteAssignment = assignments.find(
    (a) => a.athleteId === athleteId && a.status === "active"
  );

  const athleteName = athlete
    ? `${(athlete as UserType & { firstName?: string }).firstName ?? ""} ${(athlete as UserType & { lastName?: string }).lastName ?? ""}`.trim() || athleteId
    : athleteId;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/training/assignments">
          <Button variant="ghost" size="sm" className="-ml-2">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Assignments
          </Button>
        </Link>
        <Dumbbell className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <User className="h-5 w-5" />
          {athleteName}
        </h1>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-200">
          Experimental
        </span>
      </div>

      {assignmentsLoading ? (
        <p className="text-sm text-muted-foreground">Loading assignment...</p>
      ) : !athleteAssignment ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <Dumbbell className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">No active training program</p>
          <p className="text-muted-foreground text-sm mt-1">
            This athlete doesn't have an active program assigned.
          </p>
          <Link href="/training/assignments">
            <Button className="mt-4" variant="outline">Assign a Program</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base">{athleteAssignment.program?.name}</CardTitle>
                  <CardDescription>
                    Started {new Date(athleteAssignment.startDate + "T00:00:00").toLocaleDateString("en-US", {
                      month: "long", day: "numeric", year: "numeric",
                    })}
                    {" "}· {athleteAssignment.program?.durationWeeks} weeks
                  </CardDescription>
                </div>
                <Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>
              </div>
            </CardHeader>
          </Card>

          <div>
            <h2 className="text-lg font-semibold mb-3">Training Schedule</h2>
            <AthleteScheduleView
              schedule={athleteAssignment.schedule ?? []}
              assignmentId={athleteAssignment.id}
            />
          </div>
        </div>
      )}
    </div>
  );
}
