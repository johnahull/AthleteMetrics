import { User, Calendar, School, Mail, Phone, ChevronRight } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Athlete {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  birthYear: number | null;
  gender: 'M' | 'F' | null;
  graduationYear: number | null;
  teamName?: string;
  emails?: string[];
  phones?: string[];
  sports?: string[];
  lastMeasurementDate?: string | null;
  measurementCount?: number;
}

interface AthletesCardViewProps {
  athletes: Athlete[];
  onAthleteClick?: (athleteId: string) => void;
}

export function AthletesCardView({ athletes, onAthleteClick }: AthletesCardViewProps) {
  const calculateAge = (birthYear: number | null) => {
    if (!birthYear) return null;
    const currentYear = new Date().getFullYear();
    return currentYear - birthYear;
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
    return `${Math.floor(diffDays / 365)}y ago`;
  };

  if (athletes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <User className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">No athletes found</h3>
        <p className="text-sm text-muted-foreground mt-2">
          Try adjusting your filters or add a new athlete
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="athletes-card-view"
      className="grid grid-cols-1 gap-4 p-4"
    >
      {athletes.map((athlete) => {
        const age = calculateAge(athlete.birthYear);
        const lastMeasured = formatDate(athlete.lastMeasurementDate);

        return (
          <Card
            key={athlete.id}
            data-testid="athlete-card"
            className="hover:shadow-md transition-shadow"
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <CardTitle
                    data-testid="athlete-name"
                    className="text-lg flex items-center gap-2"
                  >
                    <User className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">{athlete.fullName}</span>
                  </CardTitle>
                  <CardDescription data-testid="athlete-info" className="mt-1">
                    {athlete.gender && (
                      <span className="mr-2">{athlete.gender === 'M' ? 'Male' : 'Female'}</span>
                    )}
                    {age && <span>• Age {age}</span>}
                  </CardDescription>
                </div>
                <Link href={`/athletes/${athlete.id}`}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="flex-shrink-0"
                    aria-label={`View ${athlete.fullName}'s profile`}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </Link>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              {/* Team Information */}
              {athlete.teamName && (
                <div className="flex items-center gap-2 text-sm">
                  <School className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{athlete.teamName}</span>
                </div>
              )}

              {/* Graduation Year */}
              {athlete.graduationYear && (
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span>Class of {athlete.graduationYear}</span>
                </div>
              )}

              {/* Contact Info */}
              {athlete.emails && athlete.emails.length > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <a
                    href={`mailto:${athlete.emails[0]}`}
                    className="text-primary hover:underline truncate"
                  >
                    {athlete.emails[0]}
                  </a>
                </div>
              )}

              {athlete.phones && athlete.phones.length > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <a
                    href={`tel:${athlete.phones[0]}`}
                    className="text-primary hover:underline"
                  >
                    {athlete.phones[0]}
                  </a>
                </div>
              )}

              {/* Sports */}
              {athlete.sports && athlete.sports.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {athlete.sports.map((sport, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {sport}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Last Measurement */}
              <div className="pt-2 border-t flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Last measured:</span>
                <span className="font-medium">{lastMeasured}</span>
              </div>

              {/* Measurement Count */}
              {athlete.measurementCount !== undefined && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total tests:</span>
                  <span className="font-medium">{athlete.measurementCount}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div data-testid="card-actions" className="flex gap-2 pt-2">
                <Link href={`/athletes/${athlete.id}`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full">
                    View Profile
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => onAthleteClick?.(athlete.id)}
                >
                  Add Test
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
