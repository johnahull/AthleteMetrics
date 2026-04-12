import { useState, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Zap, List, TrendingUp, Users, ChevronsUpDown, Check, Activity } from 'lucide-react';
import { SprintFvSessionSelector } from '@/components/sprint-fv/SprintFvSessionSelector';
import { SprintFvProfileList } from '@/components/sprint-fv/SprintFvProfileList';
import { SprintFvLongitudinal } from '@/components/sprint-fv/SprintFvLongitudinal';
import { UnitSystemToggle } from '@/components/sprint-fv/UnitSystemToggle';
import { UnitSystemProvider } from '@/contexts/UnitSystemContext';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import { useEligibleSummary } from '@/lib/sprint-fv-api';
import type { SiteSettings, Organization } from '@shared/schema';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface OrgAthlete {
  id: string;
  name: string;
  username: string;
}

export default function SprintFvPage() {
  const { user, organizationContext, userOrganizations } = useAuth();
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);

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

  // Determine user role
  const orgRole = user?.currentOrganization?.role || user?.role || 'athlete';
  const isCoachOrAdmin = user?.isSiteAdmin || orgRole === 'org_admin' || orgRole === 'coach';

  // Get effective org ID
  const effectiveOrgId = organizationContext
    || (Array.isArray(userOrganizations) && userOrganizations.length > 0
      ? userOrganizations[0].organizationId
      : null);

  // Fetch org athletes and eligibility summary in parallel
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

  const { data: eligibleSummary } = useEligibleSummary(isCoachOrAdmin ? effectiveOrgId : null);

  // Build a lookup: userId -> { sessionCount, latestDate }
  const eligibilityMap = useMemo(() => {
    const map = new Map<string, { sessionCount: number; latestDate: string }>();
    eligibleSummary?.forEach(s => {
      map.set(s.userId, { sessionCount: s.eligibleSessionCount, latestDate: s.latestDate });
    });
    return map;
  }, [eligibleSummary]);

  // Split athletes into eligible and not-eligible groups
  const { eligibleAthletes, otherAthletes } = useMemo(() => {
    if (!athletes) return { eligibleAthletes: [] as OrgAthlete[], otherAthletes: [] as OrgAthlete[] };
    const eligible: OrgAthlete[] = [];
    const other: OrgAthlete[] = [];
    for (const a of athletes) {
      if (eligibilityMap.has(a.id)) {
        eligible.push(a);
      } else {
        other.push(a);
      }
    }
    eligible.sort((a, b) => a.name.localeCompare(b.name));
    other.sort((a, b) => a.name.localeCompare(b.name));
    return { eligibleAthletes: eligible, otherAthletes: other };
  }, [athletes, eligibilityMap]);

  const selectedAthlete = athletes?.find(a => a.id === selectedAthleteId);

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
    <UnitSystemProvider>
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Sprint Force-Velocity Profile</h1>
          <p className="text-muted-foreground mt-1">
            Generate and analyze JB Morin sprint F-V profiles from laser gate split times
          </p>
        </div>
        <UnitSystemToggle />
      </div>

      {isCoachOrAdmin && (
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-muted-foreground shrink-0" />
            <Popover open={selectorOpen} onOpenChange={setSelectorOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={selectorOpen}
                  className="w-[350px] justify-between"
                >
                  {selectedAthlete ? (
                    <span className="flex items-center gap-2">
                      {selectedAthlete.name}
                      {eligibilityMap.has(selectedAthlete.id) && (
                        <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                          {eligibilityMap.get(selectedAthlete.id)!.sessionCount} session{eligibilityMap.get(selectedAthlete.id)!.sessionCount !== 1 ? 's' : ''}
                        </Badge>
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Select an athlete...</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[350px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search athletes..." />
                  <CommandList>
                    <CommandEmpty>No athletes found.</CommandEmpty>
                    {eligibleAthletes.length > 0 && (
                      <CommandGroup heading={`Ready for profiling (${eligibleAthletes.length})`}>
                        {eligibleAthletes.map(athlete => {
                          const info = eligibilityMap.get(athlete.id)!;
                          return (
                            <CommandItem
                              key={athlete.id}
                              value={athlete.name}
                              onSelect={() => {
                                setSelectedAthleteId(athlete.id);
                                setSelectorOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", selectedAthleteId === athlete.id ? "opacity-100" : "opacity-0")} />
                              <span className="flex-1">{athlete.name}</span>
                              <Badge variant="secondary" className="ml-2 text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                <Activity className="h-3 w-3 mr-1" />
                                {info.sessionCount}
                              </Badge>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    )}
                    {eligibleAthletes.length > 0 && otherAthletes.length > 0 && (
                      <CommandSeparator />
                    )}
                    {otherAthletes.length > 0 && (
                      <CommandGroup heading="No sprint data yet">
                        {otherAthletes.map(athlete => (
                          <CommandItem
                            key={athlete.id}
                            value={athlete.name}
                            onSelect={() => {
                              setSelectedAthleteId(athlete.id);
                              setSelectorOpen(false);
                            }}
                            className="text-muted-foreground"
                          >
                            <Check className={cn("mr-2 h-4 w-4", selectedAthleteId === athlete.id ? "opacity-100" : "opacity-0")} />
                            <span className="flex-1">{athlete.name}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
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
    </UnitSystemProvider>
  );
}
