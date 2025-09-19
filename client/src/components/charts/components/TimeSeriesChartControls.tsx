import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface TimeSeriesChartControlsProps {
  showAthleteNames: boolean;
  onShowAthleteNamesChange: (value: boolean) => void;
}

export const TimeSeriesChartControls = React.memo(function TimeSeriesChartControls({
  showAthleteNames,
  onShowAthleteNamesChange
}: TimeSeriesChartControlsProps) {
  return (
    <div className="flex flex-wrap gap-4 text-sm">
      <div className="flex items-center space-x-2">
        <Switch
          id="athlete-names"
          checked={showAthleteNames}
          onCheckedChange={onShowAthleteNamesChange}
        />
        <Label htmlFor="athlete-names">Show Athlete Names</Label>
      </div>
    </div>
  );
});