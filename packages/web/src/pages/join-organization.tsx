import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import {
  Search,
  Building2,
  MapPin,
  Users,
  ArrowRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Link as LinkIcon,
  UserCheck
} from 'lucide-react';

interface PublicOrganization {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  orgType: string;
  memberCount: number;
}

const ORG_TYPE_LABELS: Record<string, string> = {
  'youth': 'Youth',
  'high_school': 'High School',
  'college': 'College',
  'club': 'Club',
  'private_facility': 'Private Facility',
  'elite_academy': 'Elite Academy',
};

const ROLE_LABELS: Record<string, string> = {
  'org_admin': 'Admin',
  'coach': 'Coach',
  'athlete': 'Athlete',
};

export default function JoinOrganization() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, isLoading: authLoading, userOrganizations } = useAuth();
  const queryClient = useQueryClient();

  // Helper to check if user is already a member of an organization
  const isUserMemberOf = (orgId: string): boolean => {
    return userOrganizations?.some(org => org.organizationId === orgId) ?? false;
  };

  // Helper to get user's role in an organization
  const getUserRoleIn = (orgId: string): string | null => {
    const membership = userOrganizations?.find(org => org.organizationId === orgId);
    return membership?.role ?? null;
  };

  const [activeTab, setActiveTab] = useState<'code' | 'directory'>('code');
  const [joinCode, setJoinCode] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<PublicOrganization | null>(null);

  // No redirect - allow unauthenticated users to browse
  // They will be prompted to login when trying to request membership

  // Fetch public organizations
  const { data: publicOrgs, isLoading: loadingOrgs } = useQuery({
    queryKey: ['public-organizations', searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      const res = await fetch(`/api/organizations/public?${params}`);
      if (!res.ok) throw new Error('Failed to fetch organizations');
      const data = await res.json();
      return data.organizations as PublicOrganization[];
    },
    enabled: activeTab === 'directory',
  });

  // Lookup organization by join code
  const lookupMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await fetch(`/api/organizations/join/${code}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Invalid join code');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setSelectedOrg({
        ...data.organization,
        memberCount: 0, // Not returned from join code lookup
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Invalid Code",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Submit membership request
  const requestMutation = useMutation({
    mutationFn: async ({ organizationId, discoveryMethod }: { organizationId: string; discoveryMethod: string }) => {
      const res = await fetch('/api/membership-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, discoveryMethod }),
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
        // Redirect to dashboard after auto-approval
        setLocation('/');
      } else {
        // Redirect to my requests page
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

  const handleLookupCode = () => {
    if (joinCode.trim().length >= 4) {
      lookupMutation.mutate(joinCode.trim());
    }
  };

  const handleRequestMembership = (org: PublicOrganization, method: 'join_code' | 'directory') => {
    // Redirect to login if not authenticated
    if (!user) {
      setLocation('/login?redirect=/join');
      return;
    }
    requestMutation.mutate({
      organizationId: org.id,
      discoveryMethod: method,
    });
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Join an Organization</h1>
          <p className="text-muted-foreground mt-2">
            Enter a join code or browse public organizations
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'code' | 'directory')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="code" className="flex items-center gap-2">
              <LinkIcon className="h-4 w-4" />
              Join Code
            </TabsTrigger>
            <TabsTrigger value="directory" className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Browse Directory
            </TabsTrigger>
          </TabsList>

          <TabsContent value="code" className="space-y-4 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LinkIcon className="h-5 w-5" />
                  Enter Join Code
                </CardTitle>
                <CardDescription>
                  If you have a join code from an organization, enter it below
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      placeholder="Enter code (e.g., ABC12345)"
                      value={joinCode}
                      onChange={(e) => {
                        setJoinCode(e.target.value.toUpperCase());
                        setSelectedOrg(null);
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && handleLookupCode()}
                    />
                  </div>
                  <Button
                    onClick={handleLookupCode}
                    disabled={joinCode.length < 4 || lookupMutation.isPending}
                  >
                    {lookupMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Look Up'
                    )}
                  </Button>
                </div>

                {selectedOrg && (() => {
                  const isMember = isUserMemberOf(selectedOrg.id);
                  const userRole = getUserRoleIn(selectedOrg.id);

                  return (
                    <div className="border rounded-lg p-4 bg-green-50 border-green-200">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-lg">{selectedOrg.name}</h3>
                            {isMember && (
                              <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
                                <UserCheck className="h-3 w-3 mr-1" />
                                Member{userRole ? ` (${ROLE_LABELS[userRole] || userRole})` : ''}
                              </Badge>
                            )}
                          </div>
                          {selectedOrg.description && (
                            <p className="text-sm text-muted-foreground mt-1">{selectedOrg.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                            <Badge variant="secondary">{ORG_TYPE_LABELS[selectedOrg.orgType] || selectedOrg.orgType}</Badge>
                            {selectedOrg.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {selectedOrg.location}
                              </span>
                            )}
                          </div>
                        </div>
                        <CheckCircle2 className="h-6 w-6 text-green-600" />
                      </div>
                      {isMember ? (
                        <div className="mt-4 space-y-2">
                          <Alert>
                            <UserCheck className="h-4 w-4" />
                            <AlertDescription>
                              You're already a member of this organization as {userRole ? ROLE_LABELS[userRole] || userRole : 'a member'}.
                            </AlertDescription>
                          </Alert>
                          <Button
                            className="w-full"
                            variant="outline"
                            onClick={() => setLocation(`/organizations/${selectedOrg.id}`)}
                          >
                            View Organization
                            <ArrowRight className="h-4 w-4 ml-2" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          className="w-full mt-4"
                          onClick={() => handleRequestMembership(selectedOrg, 'join_code')}
                          disabled={requestMutation.isPending}
                        >
                          {requestMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : null}
                          Request to Join
                        </Button>
                      )}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="directory" className="space-y-4 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  Browse Organizations
                </CardTitle>
                <CardDescription>
                  Search for organizations accepting new members
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, location..."
                    className="pl-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                {loadingOrgs ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : publicOrgs && publicOrgs.length > 0 ? (
                  <div className="space-y-3">
                    {publicOrgs.map((org) => {
                      const isMember = isUserMemberOf(org.id);
                      const userRole = getUserRoleIn(org.id);

                      return (
                        <div
                          key={org.id}
                          className={`border rounded-lg p-4 transition-colors ${
                            isMember
                              ? 'border-green-200 bg-green-50/50'
                              : 'hover:border-primary/50'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold">{org.name}</h3>
                                {isMember && (
                                  <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
                                    <UserCheck className="h-3 w-3 mr-1" />
                                    Member{userRole ? ` (${ROLE_LABELS[userRole] || userRole})` : ''}
                                  </Badge>
                                )}
                              </div>
                              {org.description && (
                                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                  {org.description}
                                </p>
                              )}
                              <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                                <Badge variant="secondary">
                                  {ORG_TYPE_LABELS[org.orgType] || org.orgType}
                                </Badge>
                                {org.location && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {org.location}
                                  </span>
                                )}
                                <span className="flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  {org.memberCount} members
                                </span>
                              </div>
                            </div>
                            {isMember ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setLocation(`/organizations/${org.id}`)}
                              >
                                View
                                <ArrowRight className="h-4 w-4 ml-1" />
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => handleRequestMembership(org, 'directory')}
                                disabled={requestMutation.isPending}
                              >
                                Request
                                <ArrowRight className="h-4 w-4 ml-1" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Building2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No public organizations found</p>
                    <p className="text-sm mt-1">Try a different search or ask for a join code</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="text-center text-sm text-muted-foreground">
          <p>
            Already a member?{' '}
            <Button variant="link" className="p-0 h-auto" onClick={() => setLocation('/')}>
              Go to Dashboard
            </Button>
          </p>
        </div>
      </div>
    </div>
  );
}
