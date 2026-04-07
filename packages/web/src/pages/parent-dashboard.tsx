/**
 * Parent Dashboard (C9)
 *
 * Shown to users with role='parent'. Lists all linked children
 * with their latest measurement date and a "View Progress" link.
 *
 * Route: /parent-dashboard
 */
import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Users,
  ChevronRight,
  AlertCircle,
  Calendar,
  UserCheck,
  UserPlus,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';

interface ParentLinkRequest {
  id: string;
  athleteUserId: string;
  organizationId: string | null;
  status: 'pending' | 'approved' | 'denied' | 'cancelled';
  denialReason: string | null;
  createdAt: string;
  expiresAt: string;
  processedAt: string | null;
  childFirstName: string | null;
  childLastName: string | null;
}

const REQUEST_STATUS_CONFIG: Record<
  ParentLinkRequest['status'],
  { label: string; badgeClass: string; icon: typeof Clock }
> = {
  pending:   { label: 'Pending',   badgeClass: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200',    icon: Clock },
  approved:  { label: 'Approved',  badgeClass: 'border-green-300 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-950/30 dark:text-green-200',    icon: CheckCircle2 },
  denied:    { label: 'Denied',    badgeClass: 'border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950/30 dark:text-red-200',                icon: XCircle },
  cancelled: { label: 'Cancelled', badgeClass: 'border-gray-300 bg-gray-50 text-gray-600 dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-400',          icon: XCircle },
};

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
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Role guard — only parents can access this page
  useEffect(() => {
    if (!user) {
      setLocation('/login');
    } else if (user.role !== 'parent') {
      setLocation('/dashboard');
    }
  }, [user, setLocation]);

  const {
    data: children,
    isLoading,
    error,
  } = useQuery<LinkedChildLink[]>({
    queryKey: ['/api/parent/children'],
    enabled: !!user && user.role === 'parent',
  });

  const {
    data: linkRequests,
    isLoading: linkRequestsLoading,
  } = useQuery<ParentLinkRequest[]>({
    queryKey: ['/api/parent/link-requests'],
    enabled: !!user,
  });

  const cancelMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const res = await fetch(`/api/parent/link-requests/${requestId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to cancel request');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/parent/link-requests'] });
      toast({ title: 'Request cancelled', description: 'Your link request has been cancelled.' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-foreground">My Children</h1>
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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">My Children</h1>
            <p className="text-sm text-muted-foreground">
              Track your children's athletic progress
            </p>
          </div>
        </div>
        <Button onClick={() => setLocation('/parent/link-child')} className="shrink-0">
          <UserPlus className="mr-2 h-4 w-4" />
          Link a Child
        </Button>
      </div>

      {/* Children list */}
      {!children || children.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <UserCheck className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">No linked children yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
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
                className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setLocation(`/parent/children/${link.athleteId}`)}
              >
                {/* Accent bar */}
                <div className="h-1 bg-gradient-to-r from-primary/60 to-primary/20" />

                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    {/* Initials avatar */}
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                      {athlete.firstName[0]}{athlete.lastName[0]}
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-lg leading-tight">
                        {athlete.firstName} {athlete.lastName}
                      </CardTitle>
                      <CardDescription className="text-xs text-muted-foreground">
                        @{athlete.username}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
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

      {/* Link Requests Section */}
      {(linkRequestsLoading || (linkRequests && linkRequests.length > 0)) && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Link Requests</h2>

          {linkRequestsLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <Card key={i}>
                  <CardContent className="py-4 px-4">
                    <Skeleton className="h-4 w-40 mb-2" />
                    <Skeleton className="h-4 w-28" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {linkRequests!.map((req) => {
                const cfg = REQUEST_STATUS_CONFIG[req.status];
                const StatusIcon = cfg.icon;
                const childName =
                  req.childFirstName && req.childLastName
                    ? `${req.childFirstName} ${req.childLastName}`
                    : 'Unknown';
                const submittedDate = new Date(req.createdAt).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                });

                return (
                  <Card key={req.id}>
                    <CardContent className="py-3 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <p className="font-medium text-sm text-foreground truncate">{childName}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={`text-xs ${cfg.badgeClass}`}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {cfg.label}
                          </Badge>
                          <span className="text-xs text-muted-foreground">Submitted {submittedDate}</span>
                        </div>
                        {req.status === 'denied' && req.denialReason && (
                          <p className="text-xs text-muted-foreground italic">"{req.denialReason}"</p>
                        )}
                      </div>

                      {req.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          disabled={cancelMutation.isPending && cancelMutation.variables === req.id}
                          onClick={() => cancelMutation.mutate(req.id)}
                        >
                          {cancelMutation.isPending && cancelMutation.variables === req.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            'Cancel'
                          )}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
