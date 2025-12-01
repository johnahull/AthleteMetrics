import { useState } from 'react';
import { CalendarDays, Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import {
  TIMEFRAME_PRESETS,
  formatDateRange,
  type TimeframePreset,
} from '@shared/dashboard-timeframe';

interface DashboardTimeframeFilterProps {
  timeframe: TimeframePreset | 'custom';
  startDate: string | null;
  endDate: string | null;
  onTimeframeChange: (update: {
    timeframe: TimeframePreset | 'custom';
    startDate?: string;
    endDate?: string;
  }) => void;
}

export function DashboardTimeframeFilter({
  timeframe,
  startDate,
  endDate,
  onTimeframeChange,
}: DashboardTimeframeFilterProps) {
  const [isCustomExpanded, setIsCustomExpanded] = useState(false);
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(
    startDate ? new Date(startDate) : undefined
  );
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(
    endDate ? new Date(endDate) : undefined
  );
  const [isOpen, setIsOpen] = useState(false);

  // Get display label for button
  const getDisplayLabel = () => {
    if (timeframe === 'custom' && startDate && endDate) {
      // Convert string dates to Date objects for formatDateRange
      const startDateObj = new Date(startDate + 'T00:00:00Z');
      const endDateObj = new Date(endDate + 'T00:00:00Z');
      // Validate dates are valid before formatting
      if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
        return 'Custom Range';
      }
      return formatDateRange(startDateObj, endDateObj);
    }
    if (timeframe === 'custom') {
      return 'Custom Range';
    }
    const preset = TIMEFRAME_PRESETS.find((p) => p.value === timeframe);
    return preset?.label || 'Last 30 Days';
  };

  // Handle preset selection
  const handlePresetSelect = (value: TimeframePreset) => {
    onTimeframeChange({ timeframe: value });
    setIsOpen(false);
    setIsCustomExpanded(false);
  };

  // Handle custom range click
  const handleCustomRangeClick = () => {
    setIsCustomExpanded(true);
  };

  // Handle apply custom range
  const handleApplyCustomRange = () => {
    if (customStartDate && customEndDate) {
      // Validate dates
      if (customStartDate > customEndDate) {
        // Swap if needed
        const temp = customStartDate;
        setCustomStartDate(customEndDate);
        setCustomEndDate(temp);
        onTimeframeChange({
          timeframe: 'custom',
          startDate: customEndDate.toISOString().split('T')[0],
          endDate: temp.toISOString().split('T')[0],
        });
      } else {
        onTimeframeChange({
          timeframe: 'custom',
          startDate: customStartDate.toISOString().split('T')[0],
          endDate: customEndDate.toISOString().split('T')[0],
        });
      }
      setIsOpen(false);
      setIsCustomExpanded(false);
    }
  };

  // Handle cancel custom range
  const handleCancelCustomRange = () => {
    setIsCustomExpanded(false);
    // Reset to current dates if any
    setCustomStartDate(startDate ? new Date(startDate) : undefined);
    setCustomEndDate(endDate ? new Date(endDate) : undefined);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-[200px] justify-between"
          data-testid="dashboard-timeframe-selector"
        >
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            <span>{getDisplayLabel()}</span>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        {!isCustomExpanded ? (
          <div className="flex flex-col">
            {/* Preset options */}
            <div className="p-1">
              {TIMEFRAME_PRESETS.filter((p) => p.value !== 'custom').map((preset) => (
                <Button
                  key={preset.value}
                  variant="ghost"
                  className="w-full justify-start font-normal"
                  onClick={() => handlePresetSelect(preset.value as TimeframePreset)}
                >
                  <Check
                    className={`mr-2 h-4 w-4 ${
                      timeframe === preset.value ? 'opacity-100' : 'opacity-0'
                    }`}
                  />
                  {preset.label}
                </Button>
              ))}
              <Separator className="my-1" />
              <Button
                variant="ghost"
                className="w-full justify-start font-normal"
                onClick={handleCustomRangeClick}
              >
                <Check
                  className={`mr-2 h-4 w-4 ${
                    timeframe === 'custom' ? 'opacity-100' : 'opacity-0'
                  }`}
                />
                Custom Range...
              </Button>
            </div>
          </div>
        ) : (
          /* Custom range section */
          <div className="p-4 space-y-4">
            <div className="space-y-2">
              <label id="from-date-label" className="text-sm font-medium">From</label>
              <Calendar
                mode="single"
                selected={customStartDate}
                onSelect={setCustomStartDate}
                toDate={new Date()} // Prevent future date selection
                aria-labelledby="from-date-label"
                initialFocus
              />
            </div>
            <div className="space-y-2">
              <label id="to-date-label" className="text-sm font-medium">To</label>
              <Calendar
                mode="single"
                selected={customEndDate}
                onSelect={setCustomEndDate}
                toDate={new Date()} // Prevent future date selection
                aria-labelledby="to-date-label"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleCancelCustomRange}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleApplyCustomRange}
                disabled={!customStartDate || !customEndDate}
              >
                Apply
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
