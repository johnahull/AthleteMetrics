import { forwardRef, useId, useImperativeHandle, useRef } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

export type Protocol505 = 'M' | 'YD';

interface Protocol505PickerProps {
  /** undefined means nothing chosen; there is deliberately no default. */
  value: Protocol505 | undefined;
  onChange: (value: Protocol505) => void;
  disabled?: boolean;
  /** Inline error (server said a 5-0-5 reading needs a choice). Announced and tied to the group. */
  error?: string;
}

export interface Protocol505PickerHandle {
  /** Move focus into the radio group (checked radio, else the first). */
  focus: () => void;
}

/**
 * Required, no-default choice of the 5-0-5 protocol (5 m or 5 yd legs).
 * OCR readings of the 5-0-5 are only saved once this is chosen.
 */
export const Protocol505Picker = forwardRef<Protocol505PickerHandle, Protocol505PickerProps>(
function Protocol505Picker({ value, onChange, disabled, error }, ref) {
  const baseId = useId();
  const legendId = `${baseId}-legend`;
  const errorId = `${baseId}-error`;
  const meterId = `${baseId}-m`;
  const yardId = `${baseId}-yd`;
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);
  useImperativeHandle(ref, () => ({
    focus: () => {
      const radios = fieldsetRef.current?.querySelectorAll<HTMLElement>('[role="radio"]');
      const target = fieldsetRef.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]') ?? radios?.[0];
      target?.focus();
    },
  }));
  return (
    <fieldset ref={fieldsetRef} className="space-y-2" disabled={disabled}>
      <legend id={legendId} className="text-sm font-medium">
        5-0-5 protocol <span className="text-destructive" aria-hidden="true">*</span>
      </legend>
      <RadioGroup
        value={value ?? ""}
        onValueChange={(v) => onChange(v as Protocol505)}
        required
        aria-labelledby={legendId}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        className="flex gap-6"
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="M" id={meterId} />
          <Label htmlFor={meterId} className="cursor-pointer">Meters</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="YD" id={yardId} />
          <Label htmlFor={yardId} className="cursor-pointer">Yards</Label>
        </div>
      </RadioGroup>
      <p className="text-xs text-muted-foreground">
        Needed only if the photo has 5-0-5 readings: pick the distance used for the test. The photo is not imported without it.
      </p>
      {error && (
        <p id={errorId} role="alert" aria-live="assertive" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
});
