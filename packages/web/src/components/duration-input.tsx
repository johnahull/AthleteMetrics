import * as React from "react";
import { Input } from "@/components/ui/input";
import { formatDuration, formatDurationExact, parseDuration } from "@shared/duration-format";

const MINUTES_DOT_SECONDS = /^(\d+)\.([0-5]\d)$/;
const PLAIN_NUMBER = /^\d+(\.\d+)?$/;

/**
 * A non-blocking hint for a plain number under 60 s on a time metric: "6.42" is most likely 6:42, not 6.42 s.
 */
export function durationTypoWarning(text: string): string | null {
  const trimmed = text.trim();
  if (!PLAIN_NUMBER.test(trimmed)) return null;
  const seconds = Number(trimmed);
  if (seconds >= 60) return null;
  const m = MINUTES_DOT_SECONDS.exec(trimmed);
  if (m) return `Did you mean ${m[1]}:${m[2]}? A plain number is read as seconds.`;
  return `${trimmed} is read as ${trimmed} seconds (${formatDuration(seconds, 1)}). For minutes, type m:ss, e.g. 6:42.`;
}

/** 0, NaN and empty all mean "no value" */
const asValue = (n: number | null | undefined) => (n && Number.isFinite(n) ? n : undefined);

type DurationInputProps = Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value: number | null | undefined;
  /** Seconds, or undefined when the field is empty or not a valid time */
  onValueChange: (seconds: number | undefined) => void;
};

/**
 * Text input for a time metric: accepts 6:42.5, 1:02:03 or plain seconds and reports seconds.
 * Props such as id and aria-* go to the input, so it works inside FormControl.
 */
export const DurationInput = React.forwardRef<HTMLInputElement, DurationInputProps>(
  ({ value, onValueChange, onBlur, placeholder = "m:ss, e.g. 6:42.5", ...props }, ref) => {
    const [text, setText] = React.useState(() => (asValue(value) ? formatDurationExact(value as number) : ""));
    const [touched, setTouched] = React.useState(false);

    // Follow outside changes (form reset, suggestion) without overwriting what is being typed
    React.useEffect(() => {
      const incoming = asValue(value);
      if (incoming !== asValue(parseDuration(text))) setText(incoming ? formatDurationExact(incoming) : "");
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const invalid = touched && text.trim() !== "" && parseDuration(text) === null;
    const warning = invalid ? null : durationTypoWarning(text);

    return (
      <div className="w-full">
        <Input
          {...props}
          ref={ref}
          type="text"
          inputMode="text"
          placeholder={placeholder}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onValueChange(parseDuration(e.target.value) ?? undefined);
          }}
          onBlur={(e) => {
            setTouched(true);
            onBlur?.(e);
          }}
        />
        {invalid && <p className="text-xs text-red-500 mt-1">Enter a time as m:ss, e.g. 6:42.5</p>}
        {warning && (
          <p className="text-xs text-amber-600 mt-1" role="status">
            {warning}
          </p>
        )}
      </div>
    );
  }
);
DurationInput.displayName = "DurationInput";
