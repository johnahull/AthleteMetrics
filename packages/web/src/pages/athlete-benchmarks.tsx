import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AthleteBenchmarkStatus } from "@/components/benchmarks";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";

export default function AthleteBenchmarksPage() {
  const { id: athleteId } = useParams();
  const { organizationContext } = useAuth();

  // Fetch athlete data to get organization ID and name
  const { data: athlete, isLoading, error } = useQuery({
    queryKey: ["/api/athletes", athleteId],
    queryFn: async () => {
      const response = await fetch(`/api/athletes/${athleteId}`);
      if (!response.ok) throw new Error('Failed to fetch athlete');
      return response.json();
    },
    enabled: !!athleteId,
  });

  if (isLoading) {
    return <LoadingSpinner text="Loading athlete benchmarks..." />;
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Error Loading Athlete</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {error instanceof Error ? error.message : "Failed to load athlete data. Please try again."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!athlete || !athleteId) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Athlete Not Found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Could not find the requested athlete.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Derive organizationId from:
  // 1. The athlete's team organization (if they have teams with organization info)
  // 2. Fall back to the current user's organization context
  const athleteTeamOrgId = athlete.teams?.[0]?.organization?.id;
  const organizationId = athleteTeamOrgId || organizationContext || "unknown-org";

  return (
    <AthleteBenchmarkStatus
      organizationId={organizationId}
      athleteId={athleteId}
      athleteName={athlete.fullName || `${athlete.firstName} ${athlete.lastName}`}
    />
  );
}
