/**
 * Profile Merge Confirm - Step 3
 *
 * Final confirmation step with type-to-confirm safety mechanism.
 * User must type "MERGE" to confirm the irreversible action.
 */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Trash2, CheckCircle, Loader2, ArrowRight } from "lucide-react";
import { Label } from "@/components/ui/label";

// Confirmation text constant for type-to-confirm safety mechanism
const MERGE_CONFIRMATION_TEXT = "MERGE";

interface MergePreview {
  source: {
    id: string;
    fullName: string;
    emails: string[];
    measurementCount: number;
    teamMembershipCount: number;
    goalCount: number;
    achievementCount: number;
    wellnessResponseCount: number;
    eventRegistrationCount: number;
  };
  target: {
    id: string;
    fullName: string;
    emails: string[];
    measurementCount: number;
    teamMembershipCount: number;
    goalCount: number;
    achievementCount: number;
    wellnessResponseCount: number;
    eventRegistrationCount: number;
  };
  warnings: string[];
  canMerge: boolean;
}

interface Athlete {
  id: string;
  fullName: string;
  emails?: string[];
}

interface ProfileMergeConfirmProps {
  preview: MergePreview;
  sourceAthlete: Athlete;
  targetAthlete: Athlete;
  onConfirm: () => void;
  isLoading: boolean;
}

export function ProfileMergeConfirm({
  preview,
  sourceAthlete,
  targetAthlete,
  onConfirm,
  isLoading,
}: ProfileMergeConfirmProps) {
  const [confirmText, setConfirmText] = useState("");
  const isConfirmValid = confirmText.toUpperCase() === MERGE_CONFIRMATION_TEXT;

  const totalDataTransferred =
    preview.source.measurementCount +
    preview.source.teamMembershipCount +
    preview.source.goalCount +
    preview.source.achievementCount +
    preview.source.wellnessResponseCount +
    preview.source.eventRegistrationCount;

  return (
    <div className="space-y-6">
      {/* Warning */}
      <Alert variant="destructive" className="border-red-300">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>This action cannot be undone</AlertTitle>
        <AlertDescription>
          Once merged, the source profile will be permanently soft-deleted.
          All data will be transferred to the target profile.
        </AlertDescription>
      </Alert>

      {/* Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Merge Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Visual merge representation */}
          <div className="flex items-center justify-center gap-4 py-4">
            <div className="text-center p-4 bg-red-50 rounded-lg border border-red-200">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Trash2 className="h-5 w-5 text-red-500" />
                <Badge variant="destructive">Source</Badge>
              </div>
              <p className="font-medium text-red-800">{sourceAthlete.fullName}</p>
              <p className="text-sm text-red-600 mt-1">Will be deleted</p>
            </div>

            <ArrowRight className="h-8 w-8 text-muted-foreground" />

            <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center justify-center gap-2 mb-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <Badge className="bg-green-600">Target</Badge>
              </div>
              <p className="font-medium text-green-800">{targetAthlete.fullName}</p>
              <p className="text-sm text-green-600 mt-1">Will receive all data</p>
            </div>
          </div>

          {/* Data to be transferred */}
          <div className="border rounded-lg p-4 bg-muted/50">
            <h4 className="font-medium mb-3">Data to be transferred:</h4>
            <ul className="grid grid-cols-2 gap-2 text-sm">
              {preview.source.measurementCount > 0 && (
                <li className="flex items-center gap-2">
                  <Badge variant="secondary">{preview.source.measurementCount}</Badge>
                  Measurements
                </li>
              )}
              {preview.source.teamMembershipCount > 0 && (
                <li className="flex items-center gap-2">
                  <Badge variant="secondary">{preview.source.teamMembershipCount}</Badge>
                  Team Memberships
                </li>
              )}
              {preview.source.goalCount > 0 && (
                <li className="flex items-center gap-2">
                  <Badge variant="secondary">{preview.source.goalCount}</Badge>
                  Goals
                </li>
              )}
              {preview.source.achievementCount > 0 && (
                <li className="flex items-center gap-2">
                  <Badge variant="secondary">{preview.source.achievementCount}</Badge>
                  Achievements
                </li>
              )}
              {preview.source.wellnessResponseCount > 0 && (
                <li className="flex items-center gap-2">
                  <Badge variant="secondary">{preview.source.wellnessResponseCount}</Badge>
                  Wellness Responses
                </li>
              )}
              {preview.source.eventRegistrationCount > 0 && (
                <li className="flex items-center gap-2">
                  <Badge variant="secondary">{preview.source.eventRegistrationCount}</Badge>
                  Event Registrations
                </li>
              )}
              {preview.source.emails.length > 0 && (
                <li className="flex items-center gap-2">
                  <Badge variant="secondary">{preview.source.emails.length}</Badge>
                  Email Address(es)
                </li>
              )}
            </ul>
            {totalDataTransferred === 0 && preview.source.emails.length === 0 && (
              <p className="text-muted-foreground text-sm italic">
                No data to transfer - source profile is empty
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Type-to-confirm */}
      <Card className="border-2 border-dashed">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="text-center">
              <Label htmlFor="confirm-text" className="text-base">
                Type <span className="font-bold text-red-600">{MERGE_CONFIRMATION_TEXT}</span> to confirm
              </Label>
            </div>
            <Input
              id="confirm-text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={`Type ${MERGE_CONFIRMATION_TEXT} here...`}
              className={`text-center text-lg font-mono ${
                confirmText.length > 0
                  ? isConfirmValid
                    ? "border-green-500 focus:ring-green-500"
                    : "border-red-500 focus:ring-red-500"
                  : ""
              }`}
              disabled={isLoading}
              data-testid="confirm-merge-input"
            />
            <div className="flex justify-center">
              <Button
                size="lg"
                variant="destructive"
                onClick={onConfirm}
                disabled={!isConfirmValid || isLoading}
                className="min-w-[200px]"
                data-testid="confirm-merge-button"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Merging Profiles...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Merge Profiles
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Additional info */}
      <div className="text-sm text-muted-foreground text-center space-y-1">
        <p>
          Historical references (who submitted/verified measurements) will be preserved.
        </p>
        <p>
          The source user's sessions will be invalidated, requiring re-authentication.
        </p>
      </div>
    </div>
  );
}

export default ProfileMergeConfirm;
