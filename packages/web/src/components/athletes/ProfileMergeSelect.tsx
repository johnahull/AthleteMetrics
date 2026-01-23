/**
 * Profile Merge Select - Step 1
 *
 * Allows the admin to select which profile will be deleted (source)
 * and which will be kept (target). Includes a swap button to easily
 * switch the selection.
 */

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AthleteSelector } from "@/components/ui/athlete-selector";
import { ArrowLeftRight, Trash2, CheckCircle, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Athlete {
  id: string;
  fullName: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  emails?: string[];
  teams?: { id: string; name: string }[];
  birthYear?: number;
}

interface ProfileMergeSelectProps {
  athletes: Athlete[];
  sourceAthlete: Athlete | null;
  targetAthlete: Athlete | null;
  onSourceChange: (athlete: Athlete | null) => void;
  onTargetChange: (athlete: Athlete | null) => void;
  onSwap: () => void;
}

export function ProfileMergeSelect({
  athletes,
  sourceAthlete,
  targetAthlete,
  onSourceChange,
  onTargetChange,
  onSwap,
}: ProfileMergeSelectProps) {
  // Convert athletes to the format expected by AthleteSelector (memoized for performance)
  const selectorAthletes = useMemo(() =>
    athletes.map((a) => ({
      ...a,
      name: a.fullName || a.name || `${a.firstName || ""} ${a.lastName || ""}`.trim(),
    })),
    [athletes]
  );

  // Check if same athlete is selected for both
  const isSameAthlete = sourceAthlete && targetAthlete && sourceAthlete.id === targetAthlete.id;

  return (
    <div className="space-y-6">
      {isSameAthlete && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            You cannot merge an athlete with themselves. Please select two different profiles.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Source (will be deleted) */}
        <Card className="border-red-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500" />
              Source Profile
              <Badge variant="destructive" className="ml-auto">
                Will be deleted
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AthleteSelector
              athletes={selectorAthletes}
              selectedAthlete={sourceAthlete ? {
                ...sourceAthlete,
                name: sourceAthlete.fullName || sourceAthlete.name,
              } : null}
              onSelect={(athlete) => onSourceChange(athlete as Athlete | null)}
              placeholder="Select profile to delete..."
              data-testid="source-athlete-selector"
            />

            {sourceAthlete && (
              <div className="mt-4 p-3 bg-red-50 rounded-lg space-y-2">
                <p className="font-medium text-red-800">{sourceAthlete.fullName}</p>
                {sourceAthlete.emails && sourceAthlete.emails.length > 0 && (
                  <p className="text-sm text-red-600">
                    Emails: {sourceAthlete.emails.join(", ")}
                  </p>
                )}
                {sourceAthlete.teams && sourceAthlete.teams.length > 0 && (
                  <p className="text-sm text-red-600">
                    Teams: {sourceAthlete.teams.map((t) => t.name).join(", ")}
                  </p>
                )}
                {sourceAthlete.birthYear && (
                  <p className="text-sm text-red-600">
                    Birth Year: {sourceAthlete.birthYear}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Target (will be kept) */}
        <Card className="border-green-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Target Profile
              <Badge variant="default" className="ml-auto bg-green-600">
                Will be kept
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AthleteSelector
              athletes={selectorAthletes}
              selectedAthlete={targetAthlete ? {
                ...targetAthlete,
                name: targetAthlete.fullName || targetAthlete.name,
              } : null}
              onSelect={(athlete) => onTargetChange(athlete as Athlete | null)}
              placeholder="Select profile to keep..."
              data-testid="target-athlete-selector"
            />

            {targetAthlete && (
              <div className="mt-4 p-3 bg-green-50 rounded-lg space-y-2">
                <p className="font-medium text-green-800">{targetAthlete.fullName}</p>
                {targetAthlete.emails && targetAthlete.emails.length > 0 && (
                  <p className="text-sm text-green-600">
                    Emails: {targetAthlete.emails.join(", ")}
                  </p>
                )}
                {targetAthlete.teams && targetAthlete.teams.length > 0 && (
                  <p className="text-sm text-green-600">
                    Teams: {targetAthlete.teams.map((t) => t.name).join(", ")}
                  </p>
                )}
                {targetAthlete.birthYear && (
                  <p className="text-sm text-green-600">
                    Birth Year: {targetAthlete.birthYear}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Swap button */}
      {sourceAthlete && targetAthlete && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={onSwap}
            className="gap-2"
            data-testid="swap-profiles-button"
            aria-label={`Swap source profile (${sourceAthlete.fullName}) and target profile (${targetAthlete.fullName})`}
          >
            <ArrowLeftRight className="h-4 w-4" />
            Swap Source and Target
          </Button>
        </div>
      )}

      {/* Help text */}
      <div className="text-sm text-muted-foreground text-center">
        <p>
          All data from the <span className="text-red-600 font-medium">source profile</span>{" "}
          will be transferred to the <span className="text-green-600 font-medium">target profile</span>.
        </p>
        <p className="mt-1">
          The source profile will be soft-deleted after the merge completes.
        </p>
      </div>
    </div>
  );
}

export default ProfileMergeSelect;
