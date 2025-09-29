/**
 * GroupSelector Component - Tabbed Interface for Multi-Group Comparison
 * Allows creating and managing groups by Teams, Age Groups, or Custom selection
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { X, Users, Calendar, Settings, Loader2 } from 'lucide-react';
import type { GroupDefinition } from '@shared/analytics-types';
import { devLog } from '@/utils/dev-logger';

interface GroupSelectorProps {
  organizationId: string;
  athletes: Array<{
    id: string;
    name: string;
    team?: string;
    birthYear?: number;
    age?: number;
    graduationYear?: number;
  }>;
  selectedGroups: GroupDefinition[];
  onGroupSelectionChange: (groups: GroupDefinition[]) => void;
  maxGroups?: number;
  className?: string;
  isLoading?: boolean;
}

export function GroupSelector({
  organizationId,
  athletes,
  selectedGroups,
  onGroupSelectionChange,
  maxGroups = 8,
  className,
  isLoading = false
}: GroupSelectorProps) {
  const [activeTab, setActiveTab] = useState<'teams' | 'age' | 'custom'>('teams');

  // Extract unique teams from athletes, handling multi-team strings
  const uniqueTeams = useMemo(() => {
    const teams = new Set<string>();
    athletes.forEach(athlete => {
      if (athlete.team) {
        // Split by common delimiters (comma, semicolon) and trim whitespace
        const teamList = athlete.team
          .split(/[,;]/)
          .map(t => t.trim())
          .filter(t => t.length > 0);

        teamList.forEach(team => {
          teams.add(team);
        });
      }
    });
    return Array.from(teams).sort();
  }, [athletes]);

  // Extract age ranges from athletes
  const ageRanges = useMemo(() => {
    const ages = athletes.map(a => a.age).filter((age): age is number => age !== undefined);

    // Handle case where no athletes have age data
    if (ages.length === 0) {
      return [];
    }

    const minAge = Math.min(...ages);
    const maxAge = Math.max(...ages);

    const ranges: Array<{ label: string; min: number; max: number }> = [];
    // Create age ranges (e.g., 13-14, 15-16, 17-18, etc.)
    for (let i = minAge; i <= maxAge; i += 2) {
      ranges.push({
        label: i === Math.min(i + 1, maxAge) ? `${i}` : `${i}-${Math.min(i + 1, maxAge)}`,
        min: i,
        max: Math.min(i + 1, maxAge)
      });
    }
    return ranges;
  }, [athletes]);

  // Handle team selection
  const handleTeamSelection = useCallback((teamName: string, isSelected: boolean) => {
    if (isSelected && selectedGroups.length >= maxGroups) {
      return; // Max groups reached
    }

    const updatedGroups = [...selectedGroups];
    if (isSelected) {
      // Add team as a group
      // Find all athletes that belong to this team (including multi-team athletes)
      const teamAthletes = athletes.filter(a => {
        if (!a.team) return false;

        // Split team string and check if it includes the selected team
        const teamList = a.team
          .split(/[,;]/)
          .map(t => t.trim())
          .filter(t => t.length > 0);

        return teamList.includes(teamName);
      });

      const newGroup: GroupDefinition = {
        id: `team-${teamName.toLowerCase().replace(/\s+/g, '-')}`,
        name: teamName,
        type: 'team',
        memberIds: teamAthletes.map(a => a.id),
        color: getGroupColor(selectedGroups.length),
        criteria: { teams: [teamName] }
      };
      updatedGroups.push(newGroup);
    } else {
      // Remove team group
      const index = updatedGroups.findIndex(g => g.type === 'team' && g.criteria?.teams?.[0] === teamName);
      if (index > -1) updatedGroups.splice(index, 1);
    }

    onGroupSelectionChange(updatedGroups);
  }, [selectedGroups, athletes, maxGroups, onGroupSelectionChange]);

  // Handle age group selection
  const handleAgeGroupSelection = useCallback((ageRange: { label: string; min: number; max: number }, isSelected: boolean) => {
    if (isSelected && selectedGroups.length >= maxGroups) {
      return; // Max groups reached
    }

    const updatedGroups = [...selectedGroups];
    if (isSelected) {
      // Add age group
      const ageGroupAthletes = athletes.filter(a =>
        a.age !== undefined && a.age >= ageRange.min && a.age <= ageRange.max
      );
      const newGroup: GroupDefinition = {
        id: `age-${ageRange.label.replace(/\s+/g, '-')}`,
        name: `Ages ${ageRange.label}`,
        type: 'age',
        memberIds: ageGroupAthletes.map(a => a.id),
        color: getGroupColor(selectedGroups.length),
        criteria: { ageFrom: ageRange.min, ageTo: ageRange.max }
      };
      updatedGroups.push(newGroup);
    } else {
      // Remove age group
      const index = updatedGroups.findIndex(g =>
        g.type === 'age' && g.criteria?.ageFrom === ageRange.min && g.criteria?.ageTo === ageRange.max
      );
      if (index > -1) updatedGroups.splice(index, 1);
    }

    onGroupSelectionChange(updatedGroups);
  }, [selectedGroups, athletes, maxGroups, onGroupSelectionChange]);

  // Handle custom group creation
  const [customSelection, setCustomSelection] = useState<string[]>([]);
  const [customGroupName, setCustomGroupName] = useState<string>('');

  const handleCreateCustomGroup = useCallback(() => {
    if (!customGroupName || customSelection.length === 0) return;
    if (selectedGroups.length >= maxGroups) return;

    const newGroup: GroupDefinition = {
      id: `custom-${Date.now()}`,
      name: customGroupName,
      type: 'custom',
      memberIds: customSelection,
      color: getGroupColor(selectedGroups.length),
      criteria: { athleteIds: customSelection }
    };

    onGroupSelectionChange([...selectedGroups, newGroup]);
    setCustomSelection([]);
    setCustomGroupName('');
  }, [customGroupName, customSelection, selectedGroups, maxGroups, onGroupSelectionChange]);

  // Remove a group
  const handleRemoveGroup = useCallback((groupId: string) => {
    const updatedGroups = selectedGroups.filter(g => g.id !== groupId);
    onGroupSelectionChange(updatedGroups);
  }, [selectedGroups, onGroupSelectionChange]);

  // Get color for group
  function getGroupColor(index: number): string {
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
    return colors[index % colors.length];
  }

  devLog.log('GroupSelector', { selectedGroups, uniqueTeams, ageRanges });

  return (
    <div className={className}>
      {/* Selected Groups Display */}
      <div className="mb-4">
        <Label id="selected-groups-label">
          Selected Groups ({selectedGroups.length}/{maxGroups})
        </Label>
        <div
          className="flex flex-wrap gap-2 mt-2"
          role="list"
          aria-labelledby="selected-groups-label"
          aria-live="polite"
          aria-relevant="additions removals"
        >
          {selectedGroups.length === 0 ? (
            <span className="text-muted-foreground text-sm" role="status">No groups selected</span>
          ) : (
            selectedGroups.map((group) => (
              <Badge
                key={group.id}
                variant="secondary"
                style={{ borderLeft: `4px solid ${group.color}` }}
                className="pl-2"
                role="listitem"
              >
                <span>{group.name} ({group.memberIds.length} athletes)</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 ml-2"
                  onClick={() => handleRemoveGroup(group.id)}
                  aria-label={`Remove ${group.name} group`}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </Button>
              </Badge>
            ))
          )}
        </div>
      </div>

      {/* Group Creation Interface */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            Create Groups for Comparison
            {isLoading && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className={isLoading ? 'opacity-50 pointer-events-none' : ''}>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'teams' | 'age' | 'custom')}>
            <TabsList className="grid w-full grid-cols-3" role="tablist" aria-label="Group selection methods">
              <TabsTrigger value="teams" aria-label="Create groups by teams">
                <Users className="h-4 w-4 mr-2" aria-hidden="true" />
                Teams
              </TabsTrigger>
              <TabsTrigger value="age" aria-label="Create groups by age ranges">
                <Calendar className="h-4 w-4 mr-2" aria-hidden="true" />
                Age Groups
              </TabsTrigger>
              <TabsTrigger value="custom" aria-label="Create custom groups">
                <Settings className="h-4 w-4 mr-2" aria-hidden="true" />
                Custom
              </TabsTrigger>
            </TabsList>

            <TabsContent value="teams" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Create groups based on team membership.
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {uniqueTeams.length === 0 ? (
                  <Alert>
                    <AlertDescription>No teams found in the selected organization.</AlertDescription>
                  </Alert>
                ) : (
                  uniqueTeams.map((team) => {
                    const isSelected = selectedGroups.some(
                      g => g.type === 'team' && g.criteria?.teams?.[0] === team
                    );
                    // Count athletes that belong to this team (including multi-team athletes)
                    const athleteCount = athletes.filter(a => {
                      if (!a.team) return false;
                      const teamList = a.team
                        .split(/[,;]/)
                        .map(t => t.trim())
                        .filter(t => t.length > 0);
                      return teamList.includes(team);
                    }).length;

                    return (
                      <div key={team} className="flex items-center space-x-2">
                        <Checkbox
                          id={`team-${team}`}
                          checked={isSelected}
                          disabled={!isSelected && selectedGroups.length >= maxGroups}
                          onCheckedChange={(checked) =>
                            handleTeamSelection(team, checked as boolean)
                          }
                        />
                        <Label
                          htmlFor={`team-${team}`}
                          className="flex-1 cursor-pointer"
                        >
                          {team}
                          <span className="text-muted-foreground ml-2">
                            ({athleteCount} athlete{athleteCount !== 1 ? 's' : ''})
                          </span>
                        </Label>
                      </div>
                    );
                  })
                )}
              </div>
            </TabsContent>

            <TabsContent value="age" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Create groups based on age ranges.
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {ageRanges.length === 0 ? (
                  <Alert>
                    <AlertDescription>No age data available for athletes.</AlertDescription>
                  </Alert>
                ) : (
                  ageRanges.map((range) => {
                    const isSelected = selectedGroups.some(
                      g => g.type === 'age' &&
                      g.criteria?.ageFrom === range.min &&
                      g.criteria?.ageTo === range.max
                    );
                    const athleteCount = athletes.filter(
                      a => a.age !== undefined && a.age >= range.min && a.age <= range.max
                    ).length;

                    return (
                      <div key={range.label} className="flex items-center space-x-2">
                        <Checkbox
                          id={`age-${range.label}`}
                          checked={isSelected}
                          disabled={!isSelected && selectedGroups.length >= maxGroups}
                          onCheckedChange={(checked) =>
                            handleAgeGroupSelection(range, checked as boolean)
                          }
                        />
                        <Label
                          htmlFor={`age-${range.label}`}
                          className="flex-1 cursor-pointer"
                        >
                          Ages {range.label}
                          <span className="text-muted-foreground ml-2">
                            ({athleteCount} athletes)
                          </span>
                        </Label>
                      </div>
                    );
                  })
                )}
              </div>
            </TabsContent>

            <TabsContent value="custom" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Create custom groups by selecting specific athletes.
              </p>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="custom-name">Group Name</Label>
                  <Input
                    id="custom-name"
                    type="text"
                    value={customGroupName}
                    onChange={(e) => setCustomGroupName(e.target.value)}
                    placeholder="Enter group name"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Select Athletes</Label>
                  <Select
                    value=""
                    onValueChange={(athleteId) => {
                      if (athleteId && !customSelection.includes(athleteId)) {
                        setCustomSelection([...customSelection, athleteId]);
                      }
                    }}
                  >
                    <SelectTrigger className="w-full mt-1">
                      <SelectValue placeholder="Select athletes..." />
                    </SelectTrigger>
                    <SelectContent>
                      {athletes
                        .filter((athlete) => !customSelection.includes(athlete.id))
                        .map((athlete) => (
                          <SelectItem
                            key={athlete.id}
                            value={athlete.id}
                          >
                            {athlete.name} {athlete.team ? `(${athlete.team})` : ''}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {customSelection.map((athleteId) => {
                      const athlete = athletes.find(a => a.id === athleteId);
                      return (
                        <Badge key={athleteId} variant="outline">
                          {athlete?.name}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-3 w-3 ml-1"
                            onClick={() => setCustomSelection(
                              customSelection.filter(id => id !== athleteId)
                            )}
                          >
                            <X className="h-2 w-2" />
                          </Button>
                        </Badge>
                      );
                    })}
                  </div>
                </div>
                <Button
                  onClick={handleCreateCustomGroup}
                  disabled={
                    !customGroupName ||
                    customSelection.length === 0 ||
                    selectedGroups.length >= maxGroups
                  }
                  className="w-full"
                >
                  Create Custom Group
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

export default GroupSelector;