/**
 * Parent Dashboard (C9)
 *
 * Shown to users with role='parent'. Lists all linked children
 * with their latest measurement date and a "View Progress" link.
 *
 * Route: /parent-dashboard
 */
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Users,
  ChevronRight,
  AlertCircle,
  Calendar,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';

interface LinkedChildLink {
  linkId: string;
  athleteId: string;
  organizationId?: string;
  consentId?: string;
  isActive: boolean;
  linkedAt: string;
  athlete: {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
  } | null;
}

export default function ParentDashboard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const {
    data: children,
    isLoading,
    error,
  } = useQuery<LinkedChildLink[]>({
    queryKey: ['/api/parent/children'],
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">My Children</h1>
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-32 mt-1" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-9 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load your children's information. Please refresh the page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
          <Users className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Children</h1>
          <p className="text-sm text-gray-500">
            Track your children's athletic progress
          </p>
        </div>
      </div>

      {/* Children list */}
      {!children || children.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <UserCheck className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No linked children yet</p>
            <p className="text-sm text-gray-400 mt-1">
              Your children will appear here once they have registered and linked your account.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {children.filter(c => c.athlete !== null).map((link) => {
            const athlete = link.athlete!;
            return (
              <Card
                key={link.athleteId}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setLocation(`/parent/children/${link.athleteId}`)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">
                    {athlete.firstName} {athlete.lastName}
                  </CardTitle>
                  <CardDescription className="text-xs text-gray-500">
                    @{athlete.username}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Linked:{' '}
                    {new Date(link.linkedAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                  <Button
                    className="w-full"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLocation(`/parent/children/${link.athleteId}`);
                    }}
                  >
                    View Progress
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
