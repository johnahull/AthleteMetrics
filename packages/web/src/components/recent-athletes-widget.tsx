import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Plus, AlertCircle, RefreshCw } from "lucide-react";
import { getMetricDisplayName } from "@/lib/metrics";
import { format } from "date-fns";

interface RecentAthlete {
  id: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  lastMeasurementDate: string;
  lastMeasurementType: string;
  teamName: string | null;
}

interface RecentAthletesWidgetProps {
  organizationId: string;
  onAddMeasurement?: (data: { athleteId: string; athleteName: string }) => void;
}

export default function RecentAthletesWidget({
  organizationId,
  onAddMeasurement,
}: RecentAthletesWidgetProps) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["/api/athletes/recent", organizationId],
    queryFn: async () => {
      const url = `/api/athletes/recent?organizationId=${organizationId}&limit=5`;
      const response = await fetch(url, {
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      return response.json() as Promise<{ athletes: RecentAthlete[] }>;
    },
    enabled: !!organizationId,
  });

  const athletes = data?.athletes || [];

  // Loading state
  if (isLoading) {
    return (
      <Card data-testid="recent-athletes-loading">
        <CardHeader className="pb-3">
          <h3 className="text-lg font-semibold text-gray-900">Recent Athletes</h3>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center justify-between animate-pulse">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                  <div>
                    <div className="h-4 bg-gray-200 rounded w-32 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-24"></div>
                  </div>
                </div>
                <div className="h-8 bg-gray-200 rounded w-24"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card data-testid="recent-athletes-error">
        <CardHeader className="pb-3">
          <h3 className="text-lg font-semibold text-gray-900">Recent Athletes</h3>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center flex-col py-8 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mb-3" />
            <p className="text-sm text-gray-600 mb-4">
              Failed to load recent athletes
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (athletes.length === 0) {
    return (
      <Card data-testid="recent-athletes-empty">
        <CardHeader className="pb-3">
          <h3 className="text-lg font-semibold text-gray-900">Recent Athletes</h3>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center flex-col py-8 text-center">
            <Users className="h-12 w-12 text-gray-400 mb-3" />
            <p className="text-sm font-medium text-gray-900 mb-1">
              No recent measurements
            </p>
            <p className="text-xs text-gray-500">
              Record measurements to see recent activity
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card role="region" aria-label="Recent athletes with measurements">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Recent Athletes</h3>
          <p className="text-sm text-gray-500">
            Last {athletes.length} {athletes.length === 1 ? "athlete" : "athletes"}
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {athletes.map((athlete) => (
            <div
              key={athlete.id}
              className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center space-x-3">
                {/* Avatar or initials */}
                {athlete.avatar ? (
                  <img
                    src={athlete.avatar}
                    alt={`${athlete.firstName} ${athlete.lastName}`}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium text-blue-700">
                      {athlete.firstName.charAt(0)}
                      {athlete.lastName.charAt(0)}
                    </span>
                  </div>
                )}

                {/* Athlete info */}
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {athlete.firstName} {athlete.lastName}
                  </p>
                  <div className="flex items-center space-x-2 text-xs text-gray-500">
                    <span>{getMetricDisplayName(athlete.lastMeasurementType)}</span>
                    <span>•</span>
                    <span>
                      {format(new Date(athlete.lastMeasurementDate), "MMM d")}
                    </span>
                    {athlete.teamName && (
                      <>
                        <span>•</span>
                        <span>{athlete.teamName}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Add measurement button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  onAddMeasurement?.({
                    athleteId: athlete.id,
                    athleteName: `${athlete.firstName} ${athlete.lastName}`,
                  })
                }
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Measurement
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
