/**
 * AtRiskAthletesAlert - Display athletes needing attention
 *
 * Features:
 * - Collapsible alert banner with amber/warning colors
 * - Only shows when at-risk athletes exist (hidden when no issues)
 * - Two sections:
 *   1. "Declining Performance" - Athletes whose performance is declining
 *   2. "Inactive Athletes" - Athletes who haven't recorded measurements recently
 * - For declining athletes:
 *   - Name (clickable, navigates to /users/{athleteId})
 *   - Metric name and decline percentage (red text)
 *   - Previous avg → Current avg values
 * - For inactive athletes:
 *   - Name (clickable)
 *   - "Last active X days ago" text
 * - Dismissable per-session (localStorage key: 'atRiskAlertDismissed')
 * - Loading state (subtle spinner, no full skeleton)
 * - Error state with retry button
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ChevronDown, ChevronUp, X, RefreshCw, Loader2 } from "lucide-react";
import { useAtRiskAthletes } from "@/hooks/useAtRiskAthletes";

interface AtRiskAthletesAlertProps {
  organizationId: string;
  teamId?: string;
  inactivityThreshold?: number;
}

export function AtRiskAthletesAlert({
  organizationId,
  teamId,
  inactivityThreshold = 14,
}: AtRiskAthletesAlertProps) {
  const [, setLocation] = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);

  // Check localStorage on mount
  useEffect(() => {
    const dismissed = localStorage.getItem('atRiskAlertDismissed') === 'true';
    setIsDismissed(dismissed);
  }, []);

  // Fetch at-risk data
  const {
    data: atRiskData,
    isLoading,
    error,
    refetch,
  } = useAtRiskAthletes({
    organizationId,
    teamId,
    inactivityThreshold,
  });

  // Handle athlete click
  const handleAthleteClick = (athleteId: string) => {
    setLocation(`/users/${athleteId}`);
  };

  // Handle dismiss
  const handleDismiss = () => {
    localStorage.setItem('atRiskAlertDismissed', 'true');
    setIsDismissed(true);
  };

  // Loading state
  if (isLoading) {
    return (
      <div data-testid="at-risk-loading" className="flex items-center justify-center py-2">
        <Loader2 className="h-5 w-5 text-amber-600 animate-spin" />
        <span className="ml-2 text-sm text-gray-600">Checking for at-risk athletes...</span>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Card data-testid="at-risk-error" className="border-red-300 bg-red-50">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center flex-col py-4 text-center">
            <AlertTriangle className="h-10 w-10 text-red-500 mb-3" />
            <p className="text-sm text-gray-600 mb-4">
              Failed to load at-risk athletes
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Don't render if no at-risk athletes or if dismissed
  if (!atRiskData || atRiskData.atRiskCount === 0 || isDismissed) {
    return null;
  }

  return (
    <Card
      data-testid="at-risk-alert"
      className="border-amber-400 bg-amber-50"
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h3 className="text-lg font-semibold text-gray-900">
              Athletes Needing Attention ({atRiskData.atRiskCount})
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsCollapsed(!isCollapsed)}
              data-testid="collapse-toggle"
              className="h-8 w-8 p-0"
            >
              {isCollapsed ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="h-8 w-8 p-0"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {!isCollapsed && (
        <CardContent>
          {/* Declining Performance Section */}
          {atRiskData.declining.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Declining Performance
              </h4>
              <div className="space-y-2">
                {atRiskData.declining.map((athlete) => (
                  <div
                    key={`${athlete.athleteId}-${athlete.metric}`}
                    className="flex items-center justify-between p-2 rounded hover:bg-amber-100 transition-colors"
                  >
                    <div className="flex-1">
                      <button
                        onClick={() => handleAthleteClick(athlete.athleteId)}
                        className="text-sm font-medium text-gray-900 hover:text-blue-600 hover:underline text-left"
                      >
                        {athlete.athleteName}
                      </button>
                      <div className="text-xs text-gray-600">
                        {athlete.teamName && <span>{athlete.teamName} • </span>}
                        <span className="text-red-600 font-medium">
                          {athlete.metricLabel}: {athlete.declinePercent.toFixed(1)}% decline
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {athlete.previousValue.toFixed(2)} → {athlete.currentValue.toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Inactive Athletes Section */}
          {atRiskData.inactive.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Inactive Athletes
              </h4>
              <div className="space-y-2">
                {atRiskData.inactive.map((athlete) => (
                  <div
                    key={athlete.athleteId}
                    className="flex items-center justify-between p-2 rounded hover:bg-amber-100 transition-colors"
                  >
                    <div className="flex-1">
                      <button
                        onClick={() => handleAthleteClick(athlete.athleteId)}
                        className="text-sm font-medium text-gray-900 hover:text-blue-600 hover:underline text-left"
                      >
                        {athlete.athleteName}
                      </button>
                      <div className="text-xs text-gray-600">
                        {athlete.teamName && <span>{athlete.teamName} • </span>}
                        <span>
                          Last active {athlete.daysSinceLastMeasurement} days ago
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
