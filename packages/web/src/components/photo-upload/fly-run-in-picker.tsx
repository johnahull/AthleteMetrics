import { forwardRef, useId, useImperativeHandle, useRef } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { FLY10_CODE_BY_RUN_IN_YD, type FlyRunInYd } from "@shared/fly-run-in";

const RUN_INS = (Object.keys(FLY10_CODE_BY_RUN_IN_YD).map(Number) as FlyRunInYd[]).sort((a, b) => a - b);

interface FlyRunInPickerProps {
  /** undefined means nothing chosen; there is deliberately no default. */
  value: FlyRunInYd | undefined;
  onChange: (value: FlyRunInYd) => void;
  disabled?: boolean;
  /** Inline error (server said a 10-yard fly reading needs a choice). Announced and tied to the group. */
  error?: string;
}

export interface FlyRunInPickerHandle {
  /** Move focus into the radio group (checked radio, else the first). */
  focus: () => void;
}

/**
 * Required, no-default choice of the run-in distance for 10-yard fly readings (AM-FEAT-017).
 * Fly times are only comparable at the same run-in, so OCR fly readings are saved only once this is chosen.
 */
export const FlyRunInPicker = forwardRef<FlyRunInPickerHandle, FlyRunInPickerProps>(
function FlyRunInPicker({ value, onChange, disabled, error }, ref) {
  const baseId = useId();
  const legendId = `${baseId}-legend`;
  const errorId = `${baseId}-error`;
  const hintId = `${baseId}-hint`;
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
        10-yard fly run-in <span className="text-destructive" aria-hidden="true">*</span>
      </legend>
      <RadioGroup
        value={value === undefined ? "" : String(value)}
        onValueChange={(v) => onChange(Number(v) as FlyRunInYd)}
        required
        aria-labelledby={legendId}
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        aria-invalid={error ? true : undefined}
        className="flex flex-wrap gap-x-6 gap-y-2"
      >
        {RUN_INS.map((yd) => {
          const id = `${baseId}-${yd}`;
          return (
            <div key={yd} className="flex items-center gap-2">
              <RadioGroupItem value={String(yd)} id={id} />
              <Label htmlFor={id} className="cursor-pointer">{yd} yd</Label>
            </div>
          );
        })}
      </RadioGroup>
      <p id={hintId} className="text-xs text-muted-foreground">
        Needed only if the photo has 10-yard fly readings: pick the run-in distance used for the test. The photo is not imported without it.
      </p>
      {error && (
        <p id={errorId} role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
});
