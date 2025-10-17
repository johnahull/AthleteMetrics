import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { UserMinus, Eye, UserCheck } from "lucide-react";
import type { User } from "@shared/schema";

interface UserWithTeamMemberships extends User {
  teamMemberships?: Array<{
    teamId: string;
    teamName: string;
    isActive: string;
    season?: string;
  }>;
}

interface AthleteCardProps {
  athlete: UserWithTeamMemberships;
  mode: 'current' | 'available';
  isSelected?: boolean;
  isOnTeam?: boolean;
  isPending?: boolean;
  onSelection?: (athleteId: string, checked: boolean) => void;
  onRemove?: (athleteId: string, athleteName: string) => void;
  onViewProfile?: (athleteId: string) => void;
  otherTeams?: Array<{ teamName: string; season?: string }>;
}

export function AthleteCard({
  athlete,
  mode,
  isSelected = false,
  isOnTeam = false,
  isPending = false,
  onSelection,
  onRemove,
  onViewProfile,
  otherTeams = []
}: AthleteCardProps) {
  const athleteName = athlete.fullName || `${athlete.firstName} ${athlete.lastName}`;

  return (
    <Card
      className={`transition-colors ${
        mode === 'current'
          ? isSelected
            ? 'bg-orange-50 border-orange-200'
            : 'hover:bg-gray-50'
          : isOnTeam
            ? 'bg-gray-50 border-gray-200'
            : isSelected
              ? 'bg-blue-50 border-blue-200'
              : 'hover:bg-gray-50'
      }`}
      role="listitem"
    >
      <CardContent className="flex items-center justify-between p-4">
        <div className="flex items-center space-x-3">
          {mode === 'current' && onSelection && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => onSelection(athlete.id, checked === true)}
              disabled={isPending}
              aria-label={`${isSelected ? 'Deselect' : 'Select'} ${athleteName} for removal`}
            />
          )}

          {mode === 'available' && onSelection && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => onSelection(athlete.id, checked === true)}
              disabled={isPending || isOnTeam}
              aria-label={`${isSelected ? 'Deselect' : 'Select'} ${athleteName}${isOnTeam ? ' (already on team)' : ''}`}
            />
          )}

          <div
            className="w-10 h-10 bg-primary rounded-full flex items-center justify-center"
            aria-hidden="true"
          >
            <span className="text-white font-medium text-sm">
              {athlete.firstName.charAt(0)}{athlete.lastName.charAt(0)}
            </span>
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="font-medium text-gray-900">
                {athleteName}
              </p>
              {/* Role information would be displayed here if available */}
              {mode === 'available' && isOnTeam && (
                <Badge variant="secondary" className="text-xs flex items-center gap-1">
                  <UserCheck className="h-3 w-3" />
                  On Team
                </Badge>
              )}
            </div>

            {athlete.birthYear && (
              <p className="text-sm text-gray-600">Born {athlete.birthYear}</p>
            )}

            {otherTeams.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {otherTeams.map((team, index) => (
                  <Badge key={index} variant="outline" className="text-xs">
                    {team.teamName}
                    {team.season && (
                      <span className="ml-1 text-gray-500">({team.season})</span>
                    )}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        {mode === 'current' && (
          <div className="flex items-center gap-2">
            {onViewProfile && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onViewProfile(athlete.id)}
                aria-label={`View profile for ${athleteName}`}
              >
                <Eye className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">View Profile</span>
              </Button>
            )}

            {onRemove && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRemove(athlete.id, athleteName)}
                className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                disabled={isPending}
                aria-label={`Remove ${athleteName} from team`}
              >
                <UserMinus className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">Remove</span>
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}