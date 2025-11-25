import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';

interface DateRangeInputProps {
  fromDate: string;
  toDate: string;
  onFromDateChange: (date: string) => void;
  onToDateChange: (date: string) => void;
}

export function DateRangeInput({
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
}: DateRangeInputProps) {
  return (
    <div className="flex gap-4">
      <div className="flex-1">
        <Label htmlFor="from-date">From</Label>
        <Input
          id="from-date"
          type="date"
          value={fromDate}
          onChange={(e) => onFromDateChange(e.target.value)}
        />
      </div>
      <div className="flex-1">
        <Label htmlFor="to-date">To</Label>
        <Input
          id="to-date"
          type="date"
          value={toDate}
          onChange={(e) => onToDateChange(e.target.value)}
        />
      </div>
    </div>
  );
}

interface FilterBadgeProps {
  label: string;
  onRemove: () => void;
}

export function FilterBadge({ label, onRemove }: FilterBadgeProps) {
  return (
    <Badge variant="secondary" className="flex items-center gap-1">
      {label}
      <button
        onClick={onRemove}
        className="hover:text-red-600"
        aria-label={`Remove ${label} filter`}
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  );
}
