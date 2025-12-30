/**
 * SelectTeamStep Component
 * Step 2: Select team(s) for template context
 */

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Team {
  id: string;
  name: string;
  level?: string;
  organization?: {
    id: string;
    name: string;
  };
}

interface SelectTeamStepProps {
  selectedTeamIds: string[];
  onNext: (teamIds: string[]) => void;
  onBack: () => void;
  onCancel: () => void;
}

export function SelectTeamStep({
  selectedTeamIds,
  onNext,
  onBack,
  onCancel
}: SelectTeamStepProps) {
  const [localSelectedIds, setLocalSelectedIds] = useState<string[]>(selectedTeamIds);

  // Fetch teams
  const {
    data: teams,
    isLoading,
    error
  } = useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: async () => {
      const response = await fetch('/api/teams');
      if (!response.ok) {
        throw new Error('Failed to fetch teams');
      }
      return response.json();
    },
  });

  // Sync with prop changes
  useEffect(() => {
    setLocalSelectedIds(selectedTeamIds);
  }, [selectedTeamIds]);

  const handleToggle = (teamId: string) => {
    setLocalSelectedIds((prev) =>
      prev.includes(teamId)
        ? prev.filter((id) => id !== teamId)
        : [...prev, teamId]
    );
  };

  const handleSelectAll = () => {
    if (teams) {
      setLocalSelectedIds(teams.map((t) => t.id));
    }
  };

  const handleClearAll = () => {
    setLocalSelectedIds([]);
  };

  const handleNext = () => {
    onNext(localSelectedIds);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading teams...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load teams. Please try again.
        </AlertDescription>
      </Alert>
    );
  }

  if (!teams || teams.length === 0) {
    return (
      <div className="space-y-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No teams found. Please create a team first before generating import templates.
          </AlertDescription>
        </Alert>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack}>
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Select Teams</h3>
        <p className="text-sm text-muted-foreground">
          Choose one or more teams. The template will include example data with these team names.
        </p>
      </div>

      {/* Bulk actions */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSelectAll}
          disabled={localSelectedIds.length === teams.length}
        >
          Select All
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleClearAll}
          disabled={localSelectedIds.length === 0}
        >
          Clear All
        </Button>
        <div className="ml-auto text-sm text-muted-foreground">
          {localSelectedIds.length} selected
        </div>
      </div>

      {/* Team list */}
      <div className="border rounded-lg max-h-[400px] overflow-y-auto">
        <div className="divide-y">
          {teams.map((team) => {
            const isSelected = localSelectedIds.includes(team.id);
            return (
              <div
                key={team.id}
                className={cn(
                  'flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer transition-colors',
                  isSelected && 'bg-muted/30'
                )}
                onClick={() => handleToggle(team.id)}
              >
                <Checkbox
                  id={`team-${team.id}`}
                  checked={isSelected}
                  onCheckedChange={() => handleToggle(team.id)}
                  onClick={(e) => e.stopPropagation()}
                />
                <Label
                  htmlFor={`team-${team.id}`}
                  className="flex-1 cursor-pointer"
                >
                  <div className="font-medium">{team.name}</div>
                  {(team.level || team.organization) && (
                    <div className="text-xs text-muted-foreground">
                      {[team.level, team.organization?.name]
                        .filter(Boolean)
                        .join(' • ')}
                    </div>
                  )}
                </Label>
              </div>
            );
          })}
        </div>
      </div>

      {/* Navigation buttons */}
      <div className="flex gap-2 pt-4">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Button
          onClick={handleNext}
          disabled={localSelectedIds.length === 0}
          className="ml-auto"
        >
          Next
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
