/**
 * AthleteHeader Component
 *
 * Displays the athlete's profile header with:
 * - Full name
 * - Birth year
 * - Gender
 * - Team affiliations
 * - School (if provided)
 * - Sports badges
 *
 * Used on the Profile page to show static athlete information.
 */

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { User, Trophy, MapPin, Calendar } from 'lucide-react';
import type { Athlete, Team } from '@shared/schema';

interface AthleteHeaderProps {
  /** The athlete data */
  athlete: Athlete;
  /** Teams the athlete belongs to */
  teams?: Team[];
  /** Optional className for styling */
  className?: string;
}

/**
 * Get initials from a name
 */
function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function AthleteHeader({ athlete, teams = [], className }: AthleteHeaderProps) {
  const fullName = athlete.fullName || `${athlete.firstName} ${athlete.lastName}`;
  const initials = getInitials(fullName);

  // Get team names from the teams prop
  const teamNames = teams.length > 0
    ? teams.map((team) => team.name).join(', ')
    : 'Independent Athlete';

  return (
    <Card className={className}>
      <CardContent className="p-6">
        <div className="flex items-start gap-6">
          {/* Avatar */}
          <Avatar className="h-24 w-24 text-2xl font-semibold">
            <AvatarFallback className="bg-blue-100 text-blue-700">
              {initials}
            </AvatarFallback>
          </Avatar>

          {/* Info */}
          <div className="flex-1">
            {/* Name */}
            <h1 className="text-2xl font-bold text-gray-900">{fullName}</h1>

            {/* Basic Info Row */}
            <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-600">
              {/* Birth Year */}
              {athlete.birthYear && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  Born {athlete.birthYear}
                </span>
              )}

              {/* Gender */}
              {athlete.gender && (
                <span className="flex items-center gap-1.5">
                  <User className="h-4 w-4 text-gray-400" />
                  {athlete.gender}
                </span>
              )}

              {/* Team */}
              <span className="flex items-center gap-1.5">
                <Trophy className="h-4 w-4 text-gray-400" />
                {teamNames}
              </span>

              {/* School */}
              {athlete.school && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-gray-400" />
                  {athlete.school}
                </span>
              )}
            </div>

            {/* Sports Badges */}
            {athlete.sports && athlete.sports.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {athlete.sports.map((sport: string) => (
                  <Badge
                    key={sport}
                    variant="secondary"
                    className="bg-blue-50 text-blue-700 hover:bg-blue-100"
                  >
                    {sport}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default AthleteHeader;
