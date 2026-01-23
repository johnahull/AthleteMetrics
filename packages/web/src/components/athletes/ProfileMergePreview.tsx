/**
 * Profile Merge Preview - Step 2
 *
 * Shows a side-by-side comparison of the source and target profiles,
 * including data counts, conflicts, and warnings.
 */

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  BarChart3,
  Users,
  Target,
  Trophy,
  Heart,
  Calendar,
  Globe,
  Shield
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
    hasGlobalAthleteLink: boolean;
    globalAthleteId?: string;
    oauthProviders: string[];
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
    hasGlobalAthleteLink: boolean;
    globalAthleteId?: string;
    oauthProviders: string[];
  };
  conflicts: Array<{
    type: string;
    description: string;
    resolution?: string;
  }>;
  warnings: string[];
  canMerge: boolean;
  blockingReason?: string;
}

interface Athlete {
  id: string;
  fullName: string;
  emails?: string[];
}

interface ProfileMergePreviewProps {
  preview: MergePreview;
  sourceAthlete: Athlete;
  targetAthlete: Athlete;
}

export function ProfileMergePreview({
  preview,
  sourceAthlete,
  targetAthlete,
}: ProfileMergePreviewProps) {
  const blockingConflicts = preview.conflicts.filter((c) => c.resolution === "blocked");
  const informationalConflicts = preview.conflicts.filter((c) => c.resolution !== "blocked");

  return (
    <div className="space-y-6">
      {/* Blocking Conflicts */}
      {blockingConflicts.length > 0 && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Merge Blocked</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside mt-2 space-y-1">
              {blockingConflicts.map((conflict, idx) => (
                <li key={idx}>{conflict.description}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Informational Conflicts */}
      {informationalConflicts.length > 0 && (
        <Alert variant="default" className="border-yellow-200 bg-yellow-50">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertTitle className="text-yellow-800">Potential Conflicts</AlertTitle>
          <AlertDescription className="text-yellow-700">
            <ul className="list-disc list-inside mt-2 space-y-1">
              {informationalConflicts.map((conflict, idx) => (
                <li key={idx}>
                  {conflict.description}
                  {conflict.resolution && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      Resolution: {conflict.resolution.replace("_", " ")}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Warnings */}
      {preview.warnings.length > 0 && (
        <Alert className="border-blue-200 bg-blue-50">
          <CheckCircle className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-800">Transfer Summary</AlertTitle>
          <AlertDescription className="text-blue-700">
            <ul className="list-disc list-inside mt-2 space-y-1">
              {preview.warnings.map((warning, idx) => (
                <li key={idx}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Side-by-side comparison */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Data Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Data Type</TableHead>
                <TableHead className="text-red-600">
                  <span className="flex items-center gap-2">
                    Source (Will be deleted)
                  </span>
                </TableHead>
                <TableHead className="text-green-600">
                  <span className="flex items-center gap-2">
                    Target (Will be kept)
                  </span>
                </TableHead>
                <TableHead>After Merge</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Full Name */}
              <TableRow>
                <TableCell className="font-medium">Full Name</TableCell>
                <TableCell className="text-red-600">{preview.source.fullName}</TableCell>
                <TableCell className="text-green-600">{preview.target.fullName}</TableCell>
                <TableCell>
                  <Badge variant="outline">{preview.target.fullName}</Badge>
                </TableCell>
              </TableRow>

              {/* Emails */}
              <TableRow>
                <TableCell className="font-medium">Emails</TableCell>
                <TableCell className="text-red-600">
                  {preview.source.emails.length > 0 ? preview.source.emails.join(", ") : "None"}
                </TableCell>
                <TableCell className="text-green-600">
                  {preview.target.emails.length > 0 ? preview.target.emails.join(", ") : "None"}
                </TableCell>
                <TableCell>
                  <span className="text-sm">
                    {[...new Set([...preview.target.emails, ...preview.source.emails])].join(", ") || "None"}
                  </span>
                </TableCell>
              </TableRow>

              {/* Measurements */}
              <TableRow>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Measurements
                  </span>
                </TableCell>
                <TableCell className="text-red-600">{preview.source.measurementCount}</TableCell>
                <TableCell className="text-green-600">{preview.target.measurementCount}</TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {preview.source.measurementCount + preview.target.measurementCount} total
                  </Badge>
                </TableCell>
              </TableRow>

              {/* Team Memberships */}
              <TableRow>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Team Memberships
                  </span>
                </TableCell>
                <TableCell className="text-red-600">{preview.source.teamMembershipCount}</TableCell>
                <TableCell className="text-green-600">{preview.target.teamMembershipCount}</TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">Will be merged (duplicates removed)</span>
                </TableCell>
              </TableRow>

              {/* Goals */}
              <TableRow>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    Goals
                  </span>
                </TableCell>
                <TableCell className="text-red-600">{preview.source.goalCount}</TableCell>
                <TableCell className="text-green-600">{preview.target.goalCount}</TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">Will be merged (duplicates skipped)</span>
                </TableCell>
              </TableRow>

              {/* Achievements */}
              <TableRow>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2">
                    <Trophy className="h-4 w-4" />
                    Achievements
                  </span>
                </TableCell>
                <TableCell className="text-red-600">{preview.source.achievementCount}</TableCell>
                <TableCell className="text-green-600">{preview.target.achievementCount}</TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">Will be merged (duplicates skipped)</span>
                </TableCell>
              </TableRow>

              {/* Wellness Responses */}
              <TableRow>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2">
                    <Heart className="h-4 w-4" />
                    Wellness Responses
                  </span>
                </TableCell>
                <TableCell className="text-red-600">{preview.source.wellnessResponseCount}</TableCell>
                <TableCell className="text-green-600">{preview.target.wellnessResponseCount}</TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {preview.source.wellnessResponseCount + preview.target.wellnessResponseCount} total
                  </Badge>
                </TableCell>
              </TableRow>

              {/* Event Registrations */}
              <TableRow>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Event Registrations
                  </span>
                </TableCell>
                <TableCell className="text-red-600">{preview.source.eventRegistrationCount}</TableCell>
                <TableCell className="text-green-600">{preview.target.eventRegistrationCount}</TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">Will be merged (duplicates removed)</span>
                </TableCell>
              </TableRow>

              {/* Global Athlete Link */}
              <TableRow>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Global Athlete Link
                  </span>
                </TableCell>
                <TableCell className="text-red-600">
                  {preview.source.hasGlobalAthleteLink ? (
                    <Badge variant="outline">Linked</Badge>
                  ) : (
                    "Not linked"
                  )}
                </TableCell>
                <TableCell className="text-green-600">
                  {preview.target.hasGlobalAthleteLink ? (
                    <Badge variant="outline">Linked</Badge>
                  ) : (
                    "Not linked"
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {preview.source.hasGlobalAthleteLink || preview.target.hasGlobalAthleteLink
                      ? "Will be consolidated"
                      : "Not linked"}
                  </span>
                </TableCell>
              </TableRow>

              {/* OAuth Providers */}
              <TableRow>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    OAuth Providers
                  </span>
                </TableCell>
                <TableCell className="text-red-600">
                  {preview.source.oauthProviders.length > 0
                    ? preview.source.oauthProviders.map((p) => (
                        <Badge key={p} variant="outline" className="mr-1">
                          {p}
                        </Badge>
                      ))
                    : "None"}
                </TableCell>
                <TableCell className="text-green-600">
                  {preview.target.oauthProviders.length > 0
                    ? preview.target.oauthProviders.map((p) => (
                        <Badge key={p} variant="outline" className="mr-1">
                          {p}
                        </Badge>
                      ))
                    : "None"}
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    Target's OAuth IDs retained, source's cleared
                  </span>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Merge Status */}
      {preview.canMerge ? (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-800">Ready to Merge</AlertTitle>
          <AlertDescription className="text-green-700">
            No blocking conflicts detected. You can proceed with the merge.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Cannot Merge</AlertTitle>
          <AlertDescription>{preview.blockingReason}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export default ProfileMergePreview;
