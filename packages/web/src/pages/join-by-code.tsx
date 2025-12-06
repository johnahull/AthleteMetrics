import { useState, useEffect } from 'react';
import { useLocation, useParams } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import {
  Building2,
  MapPin,
  Loader2,
  AlertCircle,
  CheckCircle2,
  LogIn
} from 'lucide-react';

interface OrganizationInfo {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  orgType: string;
  autoApproveRequests: boolean;
}

const ORG_TYPE_LABELS: Record<string, string> = {
  'youth': 'Youth',
  'high_school': 'High School',
  'college': 'College',
  'club': 'Club',
  'private_facility': 'Private Facility',
  'elite_academy': 'Elite Academy',
};

export default function JoinByCode() {
  const params = useParams<{ code: string }>();
  const code = params.code || '';
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  // Fetch organization by join code
  const { data: orgData, isLoading: loadingOrg, error: orgError } = useQuery({
    queryKey: ['organization-by-code', code],
    queryFn: async () => {
      if (!code || code.length < 4) throw new Error('Invalid join code');
      const res = await fetch(`/api/organizations/join/${code}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Organization not found');
      }
      return res.json();
    },
    enabled: !!code && code.length >= 4,
    retry: false,
  });

  const organization = orgData?.organization as OrganizationInfo | undefined;

  // Submit membership request
  const requestMutation = useMutation({
    mutationFn: async () => {
      if (!organization) throw new Error('No organization selected');
      const res = await fetch('/api/membership-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: organization.id,
          discoveryMethod: 'direct_link',
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to submit request');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['my-membership-requests'] });
      toast({
        title: data.request.status === 'approved' ? "Joined!" : "Request Submitted",
        description: data.message,
      });
      if (data.request.status === 'approved') {
        setLocation('/');
      } else {
        setLocation('/my-requests');
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Request Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  if (authLoading || loadingOrg) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
          <p className="text-muted-foreground mt-4">Loading organization...</p>
        </div>
      </div>
    );
  }

  // Show error if organization not found
  if (orgError || !organization) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-md mx-auto">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                <h2 className="text-xl font-semibold mb-2">Invalid Join Code</h2>
                <p className="text-muted-foreground mb-6">
                  {orgError?.message || 'The join code you used is invalid or the organization is no longer accepting members.'}
                </p>
                <div className="space-y-2">
                  <Button onClick={() => setLocation('/join')} className="w-full">
                    Try Another Code
                  </Button>
                  <Button variant="outline" onClick={() => setLocation('/')} className="w-full">
                    Go to Dashboard
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // If not logged in, show login prompt
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-md mx-auto space-y-6">
          <Card>
            <CardHeader className="text-center">
              <Building2 className="h-12 w-12 mx-auto mb-4 text-primary" />
              <CardTitle>Join {organization.name}</CardTitle>
              <CardDescription>
                You've been invited to join this organization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {organization.description && (
                <p className="text-sm text-muted-foreground text-center">
                  {organization.description}
                </p>
              )}
              <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
                <Badge variant="secondary">
                  {ORG_TYPE_LABELS[organization.orgType] || organization.orgType}
                </Badge>
                {organization.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {organization.location}
                  </span>
                )}
              </div>

              <Alert>
                <LogIn className="h-4 w-4" />
                <AlertDescription>
                  Please log in or create an account to request membership
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Button
                  className="w-full"
                  onClick={() => setLocation(`/login?redirect=/join/${code}`)}
                >
                  Log In
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setLocation(`/register?redirect=/join/${code}`)}
                >
                  Create Account
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Logged in - show join confirmation
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-md mx-auto space-y-6">
        <Card>
          <CardHeader className="text-center">
            <Building2 className="h-12 w-12 mx-auto mb-4 text-primary" />
            <CardTitle>Join {organization.name}</CardTitle>
            <CardDescription>
              {organization.autoApproveRequests
                ? "This organization has open enrollment - you'll be added immediately!"
                : "Request to join this organization"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {organization.description && (
              <p className="text-sm text-muted-foreground text-center">
                {organization.description}
              </p>
            )}
            <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
              <Badge variant="secondary">
                {ORG_TYPE_LABELS[organization.orgType] || organization.orgType}
              </Badge>
              {organization.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {organization.location}
                </span>
              )}
            </div>

            {organization.autoApproveRequests && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto mb-1" />
                <p className="text-sm text-green-700">
                  Open enrollment - instant approval!
                </p>
              </div>
            )}

            <div className="border-t pt-4">
              <p className="text-sm text-muted-foreground mb-3">
                You're joining as: <strong>{user.firstName} {user.lastName}</strong>
              </p>
              <Button
                className="w-full"
                onClick={() => requestMutation.mutate()}
                disabled={requestMutation.isPending}
              >
                {requestMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Submitting...
                  </>
                ) : organization.autoApproveRequests ? (
                  'Join Organization'
                ) : (
                  'Request to Join'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="text-center text-sm text-muted-foreground">
          <Button variant="link" className="p-0 h-auto" onClick={() => setLocation('/join')}>
            Try a different code
          </Button>
        </div>
      </div>
    </div>
  );
}
