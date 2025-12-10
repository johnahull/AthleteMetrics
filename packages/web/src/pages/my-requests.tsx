import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import {
  Building2,
  MapPin,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Plus,
  ArrowLeft
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface MembershipRequest {
  id: string;
  userId: string;
  organizationId: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  requestedRole: string;
  discoveryMethod: string | null;
  rejectionReason: string | null;
  createdAt: string;
  processedAt: string | null;
  organization: {
    id: string;
    name: string;
    description: string | null;
    location: string | null;
    orgType: string;
  };
}

const ORG_TYPE_LABELS: Record<string, string> = {
  'youth': 'Youth',
  'high_school': 'High School',
  'college': 'College',
  'club': 'Club',
  'private_facility': 'Private Facility',
  'elite_academy': 'Elite Academy',
};

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: typeof Clock }> = {
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: Clock },
  approved: { bg: 'bg-green-100', text: 'text-green-800', icon: CheckCircle2 },
  rejected: { bg: 'bg-red-100', text: 'text-red-800', icon: XCircle },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-800', icon: XCircle },
};

export default function MyRequests() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  // Fetch user's membership requests
  const { data, isLoading, error } = useQuery({
    queryKey: ['my-membership-requests'],
    queryFn: async () => {
      const res = await fetch('/api/membership-requests/my');
      if (!res.ok) throw new Error('Failed to fetch requests');
      return res.json();
    },
    enabled: !!user,
  });

  const requests = data?.requests as MembershipRequest[] | undefined;

  // Cancel request mutation
  const cancelMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const res = await fetch(`/api/membership-requests/${requestId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to cancel request');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-membership-requests'] });
      toast({
        title: "Request Cancelled",
        description: "Your membership request has been cancelled.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    setLocation('/login?redirect=/my-requests');
    return null;
  }

  const pendingRequests = requests?.filter(r => r.status === 'pending') || [];
  const pastRequests = requests?.filter(r => r.status !== 'pending') || [];

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="mb-2"
            onClick={() => setLocation('/')}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Dashboard
          </Button>
          <h1 className="text-2xl font-bold">My Membership Requests</h1>
          <p className="text-muted-foreground">
            Track your organization membership requests
          </p>
        </div>
        <Button onClick={() => setLocation('/join')}>
          <Plus className="h-4 w-4 mr-2" />
          Join Organization
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-8 text-center text-destructive">
            Failed to load requests. Please try again.
          </CardContent>
        </Card>
      ) : requests && requests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="font-semibold mb-2">No Membership Requests</h3>
            <p className="text-muted-foreground mb-4">
              You haven't requested to join any organizations yet.
            </p>
            <Button onClick={() => setLocation('/join')}>
              <Plus className="h-4 w-4 mr-2" />
              Join an Organization
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {pendingRequests.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-semibold text-lg">Pending Requests</h2>
              {pendingRequests.map((request) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  onCancel={() => cancelMutation.mutate(request.id)}
                  isCancelling={cancelMutation.isPending}
                />
              ))}
            </div>
          )}

          {pastRequests.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-semibold text-lg text-muted-foreground">Past Requests</h2>
              {pastRequests.map((request) => (
                <RequestCard
                  key={request.id}
                  request={request}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RequestCard({
  request,
  onCancel,
  isCancelling,
}: {
  request: MembershipRequest;
  onCancel?: () => void;
  isCancelling?: boolean;
}) {
  const style = STATUS_STYLES[request.status];
  const StatusIcon = style.icon;

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{request.organization.name}</h3>
              <Badge className={`${style.bg} ${style.text}`}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
              </Badge>
            </div>

            {request.organization.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                {request.organization.description}
              </p>
            )}

            <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
              <Badge variant="outline">
                {ORG_TYPE_LABELS[request.organization.orgType] || request.organization.orgType}
              </Badge>
              {request.organization.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {request.organization.location}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
              </span>
            </div>

            {request.status === 'rejected' && request.rejectionReason && (
              <div className="mt-2 text-sm text-red-600 bg-red-50 rounded p-2">
                <strong>Reason:</strong> {request.rejectionReason}
              </div>
            )}
          </div>

          {request.status === 'pending' && onCancel && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Cancel'
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
