import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

export type Protocol505 = 'M' | 'YD';

interface Protocol505PickerProps {
  /** undefined means nothing chosen; there is deliberately no default. */
  value: Protocol505 | undefined;
  onChange: (value: Protocol505) => void;
  disabled?: boolean;
}

/**
 * Required, no-default choice of the 5-0-5 protocol (5 m or 5 yd legs).
 * OCR readings of the 5-0-5 are only saved once this is chosen.
 */
export function Protocol505Picker({ value, onChange, disabled }: Protocol505PickerProps) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend id="protocol-505-legend" className="text-sm font-medium">
        5-0-5 protocol <span className="text-destructive" aria-hidden="true">*</span>
      </legend>
      <RadioGroup
        value={value ?? ""}
        onValueChange={(v) => onChange(v as Protocol505)}
        required
        aria-labelledby="protocol-505-legend"
        className="flex gap-6"
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="M" id="protocol-505-m" />
          <Label htmlFor="protocol-505-m" className="cursor-pointer">Meters</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="YD" id="protocol-505-yd" />
          <Label htmlFor="protocol-505-yd" className="cursor-pointer">Yards</Label>
        </div>
      </RadioGroup>
      <p className="text-xs text-muted-foreground">
        Required for 5-0-5 readings: pick the distance used for the test. 5-0-5 times are not saved without it.
      </p>
    </fieldset>
  );
}
