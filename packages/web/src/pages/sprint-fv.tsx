import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Zap, List, TrendingUp, Users } from 'lucide-react';
import { SprintFvSessionSelector } from '@/components/sprint-fv/SprintFvSessionSelector';
import { SprintFvProfileList } from '@/components/sprint-fv/SprintFvProfileList';
import { SprintFvLongitudinal } from '@/components/sprint-fv/SprintFvLongitudinal';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import type { SiteSettings, Organization } from '@shared/schema';
import { Card, CardContent } from '@/components/ui/card';

interface OrgAthlete {
  id: string;
  name: string;
  username: string;
}

export default function SprintFvPage() {
  const { user, organizationContext, userOrganizations } = useAuth();
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);

  const siteSettingsEndpoint = user?.isSiteAdmin ? '/api/site-settings' : '/api/site-settings/public';
  const { data: siteSettings } = useQuery<SiteSettings>({
    queryKey: [siteSettingsEndpoint],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: organization } = useQuery<Organization>({
    queryKey: [`/api/organizations/${user?.primaryOrganizationId}`],
    enabled: !!user?.primaryOrganizationId && !user?.isSiteAdmin,
    staleTime: 5 * 60 * 1000,
  });

  const isEnabled = (siteSettings?.sprintFvEnabled ?? false)
    && (user?.isSiteAdmin || (organization?.sprintFvEnabled ?? false));

  // Determine user role: coach/admin can select athletes, athletes see their own data
  const orgRole = user?.currentOrganization?.role || user?.role || 'athlete';
  const isCoachOrAdmin = user?.isSiteAdmin || orgRole === 'org_admin' || orgRole === 'coach';

  // Get effective org ID for fetching athletes
  const effectiveOrgId = organizationContext
    || (Array.isArray(userOrganizations) && userOrganizations.length > 0
      ? userOrganizations[0].organizationId
      : null);

  // Fetch org athletes for coach/admin view
  const { data: athletes } = useQuery<OrgAthlete[]>({
    queryKey: ['athletes', effectiveOrgId],
    queryFn: async () => {
      const response = await fetch(`/api/athletes?organizationId=${effectiveOrgId}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch athletes');
      return response.json();
    },
    enabled: isCoachOrAdmin && !!effectiveOrgId,
    staleTime: 5 * 60 * 1000,
  });

  // For athletes, use their own ID; for coaches, use the selected athlete
  const athleteId = isCoachOrAdmin ? selectedAthleteId : user?.id;

  if (!user) {
    return <div className="p-6 text-muted-foreground">Please log in to view Sprint F-V profiles.</div>;
  }

  if (!isEnabled && siteSettings !== undefined) {
    return (
      <div className="container mx-auto p-6">
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Zap className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Sprint F-V Profiling Not Enabled</h2>
            <p className="text-muted-foreground">
              This feature is not enabled for your organization. Contact your administrator to enable it.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Sprint Force-Velocity Profile</h1>
        <p className="text-muted-foreground mt-1">
          Generate and analyze JB Morin sprint F-V profiles from laser gate split times
        </p>
      </div>

      {isCoachOrAdmin && (
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-muted-foreground" />
            <Select
              value={selectedAthleteId || ''}
              onValueChange={(value) => setSelectedAthleteId(value)}
            >
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="Select an athlete..." />
              </SelectTrigger>
              <SelectContent>
                {athletes?.map((athlete) => (
                  <SelectItem key={athlete.id} value={athlete.id}>
                    {athlete.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {!athleteId ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Users className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Select an Athlete</h2>
            <p className="text-muted-foreground">
              Choose an athlete from the dropdown above to view their eligible sprint sessions and profiles.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="generate" className="space-y-6">
          <TabsList>
            <TabsTrigger value="generate" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Generate
            </TabsTrigger>
            <TabsTrigger value="profiles" className="flex items-center gap-2">
              <List className="h-4 w-4" />
              Profiles
            </TabsTrigger>
            <TabsTrigger value="trends" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Trends
            </TabsTrigger>
          </TabsList>

          <TabsContent value="generate">
            <SprintFvSessionSelector userId={athleteId} />
          </TabsContent>

          <TabsContent value="profiles">
            <SprintFvProfileList userId={athleteId} />
          </TabsContent>

          <TabsContent value="trends">
            <SprintFvLongitudinal userId={athleteId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
