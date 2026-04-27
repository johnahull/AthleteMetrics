import { useEffect, useState } from "react";
import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info, Minus, Plus, AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import type { AuxiliaryInputConfig } from "@/hooks/use-available-metrics";

interface PairedInputFieldsProps {
  metricCode: string;
  config: AuxiliaryInputConfig;
  disabled?: boolean;
  onMetricSwitch?: (newMetricCode: string) => void;
}

interface PreviewResponse {
  computedValue: number;
  formula: string;
  primaryUnit: string;
  auxiliaryLabel: string;
}

const WEIGHT_QUICK_PICKS_LBS = [45, 95, 135, 185, 225, 275, 315, 365, 405];
const WEIGHT_QUICK_PICKS_KG = [20, 40, 60, 80, 100, 120, 140, 160, 180];

export function PairedInputFields({
  metricCode,
  config,
  disabled = false,
  onMetricSwitch,
}: PairedInputFieldsProps) {
  const form = useFormContext();
  const primaryValue = form.watch("value");
  const auxiliaryValue = form.watch("auxiliaryValue");

  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [displayedValue, setDisplayedValue] = useState<number | null>(null);

  const quickPicks =
    config.primaryInputUnit === "kg" ? WEIGHT_QUICK_PICKS_KG : WEIGHT_QUICK_PICKS_LBS;

  // Tiered guardrails on rep count: silent / soft warn / suppress + redirect
  const repsTier: "ok" | "warn" | "block" =
    typeof auxiliaryValue !== "number" || auxiliaryValue < 1
      ? "ok"
      : auxiliaryValue <= 12
        ? "ok"
        : auxiliaryValue <= 15
          ? "warn"
          : "block";

  const switchTargetCode =
    metricCode.includes("BENCH") || metricCode.includes("OHP") || metricCode.includes("PUSH")
      ? "PUSHUPS_MAX"
      : "PULLUPS_MAX";

  // Live preview: debounced fetch when both inputs are valid
  useEffect(() => {
    if (
      typeof primaryValue !== "number" ||
      primaryValue <= 0 ||
      typeof auxiliaryValue !== "number" ||
      auxiliaryValue <= 0
    ) {
      setPreview(null);
      return;
    }

    if (repsTier === "block") {
      setPreview(null);
      return;
    }

    const handle = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const res = await apiRequest("POST", "/api/measurements/calculate-lift-preview", {
          metricCode,
          primary: primaryValue,
          auxiliary: auxiliaryValue,
        });
        const data = (await res.json()) as PreviewResponse;
        setPreview(data);
      } catch {
        setPreview(null);
      } finally {
        setPreviewLoading(false);
      }
    }, 300);

    return () => clearTimeout(handle);
  }, [primaryValue, auxiliaryValue, metricCode, repsTier]);

  // Count-up animation: ease-out from displayedValue to preview.computedValue
  useEffect(() => {
    if (preview === null) {
      setDisplayedValue(null);
      return;
    }
    const target = preview.computedValue;
    const start = displayedValue ?? target;
    if (start === target) {
      setDisplayedValue(target);
      return;
    }
    const duration = 400;
    const startTime = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplayedValue(start + (target - start) * eased);
      if (t < 1) raf = requestAnimationFrame(step);
      else setDisplayedValue(target);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview?.computedValue]);

  // Stepper soft-ceiling: allow stepping into the warn (13-15) and block (>15)
  // tiers so coaches can use the stepper UI to surface those affordances.
  // Hard ceiling at the redirect threshold (16) so the stepper doesn't run
  // away. The actual hard validation is enforced by the backend via the
  // metric's auxiliaryInputConfig.validationMax.
  const STEPPER_BLOCK_THRESHOLD = 16;
  const handleStep = (delta: number) => {
    const current = typeof auxiliaryValue === "number" ? auxiliaryValue : 0;
    const next = Math.max(
      config.validationMin ?? 0,
      Math.min(STEPPER_BLOCK_THRESHOLD, current + delta),
    );
    form.setValue("auxiliaryValue", next, { shouldValidate: true });
  };

  const handleQuickPick = (load: number) => {
    form.setValue("value", load, { shouldValidate: true });
  };

  return (
    <div className="md:col-span-2 space-y-4" data-testid="paired-input-fields">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Primary input — relabeled to e.g. "Weight Lifted" */}
        <FormField
          control={form.control}
          name="value"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {config.primaryInputLabel} <span className="text-red-500">*</span>
              </FormLabel>
              <div className="flex">
                <FormControl>
                  <Input
                    {...field}
                    type="number"
                    inputMode="numeric"
                    step="1"
                    min={0}
                    placeholder="0"
                    disabled={disabled}
                    className="rounded-r-none"
                    data-testid="paired-primary-input"
                    onChange={(e) =>
                      field.onChange(e.target.value === "" ? 0 : parseFloat(e.target.value))
                    }
                    value={field.value === 0 ? "" : field.value}
                  />
                </FormControl>
                <div className="px-4 py-2 bg-gray-100 border border-l-0 border-gray-300 rounded-r-md text-gray-600 text-sm flex items-center">
                  {config.primaryInputUnit}
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {quickPicks.map((load) => (
                  <button
                    key={load}
                    type="button"
                    onClick={() => handleQuickPick(load)}
                    disabled={disabled}
                    data-testid={`weight-quick-pick-${load}`}
                    className="px-2 py-0.5 text-xs rounded border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-50"
                  >
                    {load}
                  </button>
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Auxiliary input — Reps with stepper */}
        <FormField
          control={form.control}
          name="auxiliaryValue"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {config.label}
                {config.required && <span className="text-red-500"> *</span>}
              </FormLabel>
              <div className="flex items-stretch">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="rounded-r-none h-10 w-10"
                  onClick={() => handleStep(-1)}
                  disabled={disabled}
                  aria-label={`Decrease ${config.label}`}
                  data-testid="aux-step-down"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <FormControl>
                  <Input
                    {...field}
                    type="number"
                    inputMode="numeric"
                    step="1"
                    min={config.validationMin ?? 0}
                    max={config.validationMax ?? 999}
                    placeholder="0"
                    disabled={disabled}
                    className="rounded-none text-center"
                    data-testid="paired-auxiliary-input"
                    onChange={(e) =>
                      field.onChange(e.target.value === "" ? null : parseInt(e.target.value, 10))
                    }
                    value={typeof field.value === "number" ? field.value : ""}
                  />
                </FormControl>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="rounded-l-none h-10 w-10"
                  onClick={() => handleStep(1)}
                  disabled={disabled}
                  aria-label={`Increase ${config.label}`}
                  data-testid="aux-step-up"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* OUTPUT ZONE — distinct from inputs, larger numeric, "est." chip + formula popover */}
      <div
        className="rounded-md border border-gray-200 bg-gray-50/70 p-4"
        data-testid="paired-output-zone"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs uppercase tracking-wide text-gray-500 font-medium">
            Estimated 1RM
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-700"
                aria-label="Show formula breakdown"
                data-testid="formula-info-trigger"
              >
                <Info className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 text-sm" align="end">
              <div className="font-medium mb-1">Formula</div>
              <code className="text-xs bg-gray-100 px-2 py-1 rounded block">
                {/* preview.formula is what the backend actually evaluated.
                    Falls back to the metric definition's compute formula
                    before the preview round-trips. Either way reflects the
                    real formula — works for Epley, Brzycki, or any custom. */}
                {preview?.formula ?? config.computeFormula}
              </code>
              {preview && typeof primaryValue === "number" && typeof auxiliaryValue === "number" && (
                <div className="mt-2 text-xs text-gray-600">
                  With load = <strong>{primaryValue}</strong>, reps ={' '}
                  <strong>{auxiliaryValue}</strong>{': '}
                  <strong>
                    {preview.computedValue.toFixed(1)} {preview.primaryUnit}
                  </strong>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex items-baseline gap-2 mt-1">
          <span
            className="text-3xl font-semibold text-gray-900 tabular-nums"
            data-testid="paired-computed-value"
          >
            {repsTier === "block"
              ? "—"
              : displayedValue !== null
                ? Math.round(displayedValue * 10) / 10
                : previewLoading
                  ? "…"
                  : "—"}
          </span>
          {preview && repsTier !== "block" && (
            <>
              <span className="text-gray-500">{preview.primaryUnit}</span>
              <span
                className="ml-1 text-[10px] uppercase tracking-wider text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded"
                data-testid="est-chip"
              >
                est.
              </span>
            </>
          )}
        </div>

        {repsTier === "warn" && (
          <div
            className="mt-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5"
            data-testid="reps-warn-chip"
          >
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>
              Estimate accuracy decreases above 12 reps. The number is shown for reference but
              should be interpreted with caution.
            </span>
          </div>
        )}

        {repsTier === "block" && (
          <div
            className="mt-3 text-xs text-gray-700 bg-white border border-gray-300 rounded px-3 py-2"
            data-testid="reps-redirect-prompt"
          >
            <div className="font-medium mb-1">Use a count metric for high-rep sets</div>
            <p className="text-gray-600 mb-2">
              {config.label} above 15 makes the 1RM estimate unreliable. Track this as a count
              instead.
            </p>
            {onMetricSwitch && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onMetricSwitch(switchTargetCode)}
                data-testid="reps-redirect-button"
              >
                Switch to {switchTargetCode === "PUSHUPS_MAX" ? "Push-ups" : "Pull-ups"}
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
