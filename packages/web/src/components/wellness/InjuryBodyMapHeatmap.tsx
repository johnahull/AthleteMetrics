import { useMemo, memo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import type { WellnessResponse, WellnessTemplate } from '@shared/wellness-types';
import { calculateAthleteStatus } from '@shared/wellness-status-utils';
import { cn } from '@/lib/utils';

// Import body parts from BodyMapInput
const BODY_PARTS_WITH_COORDS: Record<string, { x: number; y: number; label: string }> = {
  'Head': { x: 0.5, y: 0.1, label: 'Head' },
  'Neck': { x: 0.5, y: 0.15, label: 'Neck' },
  'Left Shoulder': { x: 0.3, y: 0.2, label: 'Left Shoulder' },
  'Right Shoulder': { x: 0.7, y: 0.2, label: 'Right Shoulder' },
  'Chest': { x: 0.5, y: 0.25, label: 'Chest' },
  'Upper Back': { x: 0.5, y: 0.25, label: 'Upper Back' },
  'Left Elbow': { x: 0.2, y: 0.35, label: 'Left Elbow' },
  'Right Elbow': { x: 0.8, y: 0.35, label: 'Right Elbow' },
  'Left Wrist': { x: 0.15, y: 0.45, label: 'Left Wrist' },
  'Right Wrist': { x: 0.85, y: 0.45, label: 'Right Wrist' },
  'Left Hand': { x: 0.1, y: 0.5, label: 'Left Hand' },
  'Right Hand': { x: 0.9, y: 0.5, label: 'Right Hand' },
  'Abdomen': { x: 0.5, y: 0.4, label: 'Abdomen' },
  'Lower Back': { x: 0.5, y: 0.45, label: 'Lower Back' },
  'Hips': { x: 0.5, y: 0.5, label: 'Hips' },
  'Left Thigh': { x: 0.4, y: 0.6, label: 'Left Thigh' },
  'Right Thigh': { x: 0.6, y: 0.6, label: 'Right Thigh' },
  'Left Knee': { x: 0.4, y: 0.7, label: 'Left Knee' },
  'Right Knee': { x: 0.6, y: 0.7, label: 'Right Knee' },
  'Left Shin': { x: 0.4, y: 0.8, label: 'Left Shin' },
  'Right Shin': { x: 0.6, y: 0.8, label: 'Right Shin' },
  'Left Ankle': { x: 0.4, y: 0.9, label: 'Left Ankle' },
  'Right Ankle': { x: 0.6, y: 0.9, label: 'Right Ankle' },
  'Left Foot': { x: 0.4, y: 0.95, label: 'Left Foot' },
  'Right Foot': { x: 0.6, y: 0.95, label: 'Right Foot' },
};

interface InjuryBodyMapHeatmapProps {
  template: WellnessTemplate;
  responses: WellnessResponse[];
  filters?: {
    teamIds?: string[];
  };
}

interface InjuryFrequency {
  label: string;
  count: number;
  athleteIds: Set<string>;
  coords: { x: number; y: number };
}

export const InjuryBodyMapHeatmap = memo(function InjuryBodyMapHeatmap({
  template,
  responses,
  filters,
}: InjuryBodyMapHeatmapProps) {
  const [selectedBodyPart, setSelectedBodyPart] = useState<string | null>(null);
  const [dateRangePercent, setDateRangePercent] = useState<number>(100);

  // Calculate injury frequencies by body part
  const injuryFrequencies = useMemo(() => {
    if (!responses || responses.length === 0) return new Map<string, InjuryFrequency>();

    // Filter by team if specified
    let filteredResponses = responses;
    if (filters?.teamIds && filters.teamIds.length > 0) {
      filteredResponses = responses.filter(
        r => r.teamId && filters.teamIds!.includes(r.teamId)
      );
    }

    // Filter by date range (based on slider)
    if (dateRangePercent < 100) {
      const sortedResponses = [...filteredResponses].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      const cutoffIndex = Math.floor((sortedResponses.length * dateRangePercent) / 100);
      filteredResponses = sortedResponses.slice(0, cutoffIndex);
    }

    const frequencies = new Map<string, InjuryFrequency>();

    filteredResponses.forEach(response => {
      const status = calculateAthleteStatus(response, template);

      status.injuries.forEach(injury => {
        if (injury.label) {
          const existing = frequencies.get(injury.label);
          if (existing) {
            existing.count++;
            existing.athleteIds.add(response.userId);
          } else {
            const coords = BODY_PARTS_WITH_COORDS[injury.label];
            if (coords) {
              frequencies.set(injury.label, {
                label: injury.label,
                count: 1,
                athleteIds: new Set([response.userId]),
                coords: { x: coords.x, y: coords.y },
              });
            }
          }
        }
      });
    });

    return frequencies;
  }, [responses, template, filters, dateRangePercent]);

  // Get max count for color scaling
  const maxCount = useMemo(() => {
    let max = 0;
    injuryFrequencies.forEach(freq => {
      if (freq.count > max) max = freq.count;
    });
    return max;
  }, [injuryFrequencies]);

  // Get color intensity based on count
  const getColorIntensity = (count: number) => {
    if (maxCount === 0) return 0;
    return (count / maxCount) * 100;
  };

  // Get color class based on intensity
  const getColorClass = (intensity: number) => {
    if (intensity === 0) return 'bg-gray-100';
    if (intensity < 25) return 'bg-red-100 border-red-300';
    if (intensity < 50) return 'bg-red-200 border-red-400';
    if (intensity < 75) return 'bg-red-300 border-red-500';
    return 'bg-red-500 border-red-600 text-white';
  };

  const totalInjuries = Array.from(injuryFrequencies.values()).reduce(
    (sum, freq) => sum + freq.count,
    0
  );

  const uniqueAthletes = new Set(
    Array.from(injuryFrequencies.values()).flatMap(freq => Array.from(freq.athleteIds))
  ).size;

  const selectedInjury = selectedBodyPart ? injuryFrequencies.get(selectedBodyPart) : null;

  if (injuryFrequencies.size === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{template.name} - Injury Body Map</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500 text-center py-8">No injury data available</p>
        </CardContent>
      </Card>
    );
  }

  // Group body parts by region for organized display
  const bodyPartsByRegion = {
    head: ['Head', 'Neck'],
    upperBody: ['Left Shoulder', 'Right Shoulder', 'Chest', 'Upper Back'],
    arms: ['Left Elbow', 'Right Elbow', 'Left Wrist', 'Right Wrist', 'Left Hand', 'Right Hand'],
    core: ['Abdomen', 'Lower Back', 'Hips'],
    legs: ['Left Thigh', 'Right Thigh', 'Left Knee', 'Right Knee', 'Left Shin', 'Right Shin'],
    feet: ['Left Ankle', 'Right Ankle', 'Left Foot', 'Right Foot'],
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{template.name} - Injury Body Map Heatmap</CardTitle>
        <p className="text-sm text-muted-foreground">
          Visual representation of injury frequency by body part
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
          <div>
            <p className="text-sm text-muted-foreground">Total Injury Reports</p>
            <p className="text-2xl font-bold">{totalInjuries}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Athletes Affected</p>
            <p className="text-2xl font-bold">{uniqueAthletes}</p>
          </div>
        </div>

        {/* Time Range Slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Time Range</label>
            <span className="text-sm text-muted-foreground">{dateRangePercent}% of period</span>
          </div>
          <Slider
            value={[dateRangePercent]}
            onValueChange={([value]) => setDateRangePercent(value)}
            min={10}
            max={100}
            step={10}
            className="w-full"
          />
        </div>

        {/* Body Map Heatmap */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Body Map</h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 bg-red-100 border border-red-300 rounded"></div>
                <span>Low</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 bg-red-300 border border-red-500 rounded"></div>
                <span>Medium</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 bg-red-500 border border-red-600 rounded"></div>
                <span>High</span>
              </div>
            </div>
          </div>

          <div className="border rounded-lg p-4 bg-muted/30">
            <div className="space-y-4">
              {Object.entries(bodyPartsByRegion).map(([region, parts]) => (
                <div key={region} role="group" aria-label={region}>
                  <p className="text-xs font-medium text-muted-foreground mb-2 capitalize">
                    {region.replace(/([A-Z])/g, ' $1').trim()}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {parts.map(part => {
                      const freq = injuryFrequencies.get(part);
                      const count = freq?.count || 0;
                      const intensity = getColorIntensity(count);
                      const colorClass = getColorClass(intensity);
                      const isSelected = selectedBodyPart === part;

                      return (
                        <button
                          key={part}
                          type="button"
                          onClick={() => setSelectedBodyPart(part === selectedBodyPart ? null : part)}
                          className={cn(
                            'px-3 py-2 rounded-md border text-sm transition-all',
                            'hover:ring-2 hover:ring-primary hover:ring-offset-2',
                            'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
                            'min-h-[44px]',
                            colorClass,
                            isSelected && 'ring-2 ring-primary ring-offset-2'
                          )}
                          title={`${part}: ${count} reports`}
                        >
                          <div className="flex flex-col items-center gap-1">
                            <span className={cn(intensity >= 75 ? 'text-white' : 'text-gray-900')}>
                              {part}
                            </span>
                            {count > 0 && (
                              <Badge
                                variant={intensity >= 75 ? 'secondary' : 'default'}
                                className="text-xs"
                              >
                                {count}
                              </Badge>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Selected Body Part Details */}
          {selectedInjury && (
            <div className="p-4 bg-muted/50 rounded-lg border">
              <h4 className="font-semibold mb-2">{selectedInjury.label}</h4>
              <div className="space-y-1 text-sm">
                <p>
                  <span className="text-muted-foreground">Total Reports:</span>{' '}
                  <span className="font-medium">{selectedInjury.count}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Athletes Affected:</span>{' '}
                  <span className="font-medium">{selectedInjury.athleteIds.size}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">% of All Injuries:</span>{' '}
                  <span className="font-medium">
                    {((selectedInjury.count / totalInjuries) * 100).toFixed(1)}%
                  </span>
                </p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
});
