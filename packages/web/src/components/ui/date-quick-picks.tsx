import * as React from "react";
import { format, subDays } from "date-fns";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface DateQuickPicksProps {
  onSelect: (date: string) => void; // ISO date string (YYYY-MM-DD)
  selectedDate?: string;
  showCustom?: boolean; // Show custom calendar picker
  className?: string;
}

export default function DateQuickPicks({
  onSelect,
  selectedDate,
  showCustom = false,
  className,
}: DateQuickPicksProps) {
  const [calendarOpen, setCalendarOpen] = React.useState(false);

  // Calculate quick pick dates
  const today = format(new Date(), "yyyy-MM-dd");
  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
  const lastWeek = format(subDays(new Date(), 7), "yyyy-MM-dd");

  // Check if a date matches the selected date
  const isSelected = (date: string) => selectedDate === date;

  // Handle button click
  const handleQuickPick = (date: string) => {
    onSelect(date);
  };

  // Handle calendar date selection
  const handleCalendarSelect = (date: Date | undefined) => {
    if (date) {
      const formattedDate = format(date, "yyyy-MM-dd");
      onSelect(formattedDate);
      setCalendarOpen(false);
    }
  };

  return (
    <div className={cn("flex gap-2", className)}>
      <Button
        type="button"
        variant={isSelected(today) ? "default" : "outline"}
        size="sm"
        onClick={() => handleQuickPick(today)}
        aria-label="Select today"
        aria-pressed={isSelected(today)}
        className={cn(
          isSelected(today) && "bg-primary text-primary-foreground"
        )}
      >
        Today
      </Button>

      <Button
        type="button"
        variant={isSelected(yesterday) ? "default" : "outline"}
        size="sm"
        onClick={() => handleQuickPick(yesterday)}
        aria-label="Select yesterday"
        aria-pressed={isSelected(yesterday)}
        className={cn(
          isSelected(yesterday) && "bg-primary text-primary-foreground"
        )}
      >
        Yesterday
      </Button>

      <Button
        type="button"
        variant={isSelected(lastWeek) ? "default" : "outline"}
        size="sm"
        onClick={() => handleQuickPick(lastWeek)}
        aria-label="Select one week ago"
        aria-pressed={isSelected(lastWeek)}
        className={cn(
          isSelected(lastWeek) && "bg-primary text-primary-foreground"
        )}
      >
        Last Week
      </Button>

      {showCustom && (
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" aria-label="Custom">
              Custom <ChevronDown className="ml-1 h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate ? new Date(selectedDate) : undefined}
              onSelect={handleCalendarSelect}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
