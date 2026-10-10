/**
 * EvalTemplatePicker - optional "Start from template" choice on the new-event form (AM-FEAT-019 P5).
 * Offers the organization's eval battery templates and the global default. Optional tests are off unless ticked.
 * Renders nothing when the templates cannot be read (a non-writer) or there are none.
 */

import { useRef, type Dispatch, type SetStateAction } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEvalTemplates, useFetchResolvedEvalTemplate, useResolvedEvalTemplate } from "@/hooks/use-eval-report";
import { SINGLE_LEG_CMJ_KEYS, templateKeyLabel, templateMetricLabel } from "@/lib/eval-template-labels";
import { clearTemplateEntries, replaceTemplateEntries, setOptionalEntry, unavailableTests } from "@/lib/eval-template-selection";
import type { SelectedMetric } from "./MetricsSelector";

export interface EvalTemplateChoice {
  templateId: string;
  /** Template keys of the optional metrics to add on top of the required ones */
  includeOptional: string[];
}

interface EvalTemplatePickerProps {
  organizationId: string | undefined;
  value: EvalTemplateChoice | null;
  onChange: (value: EvalTemplateChoice | null) => void;
  /** Updates the form's metrics list, which the picker fills */
  onSelectedMetricsChange: Dispatch<SetStateAction<SelectedMetric[]>>;
}

const NONE = "none";

export function EvalTemplatePicker({ organizationId, value, onChange, onSelectedMetricsChange }: EvalTemplatePickerProps) {
  const { data: templates, isError } = useEvalTemplates(organizationId);
  const { data: resolvedTemplate, isError: resolveFailed, isLoading: resolving } = useResolvedEvalTemplate(value?.templateId);
  const fetchResolved = useFetchResolvedEvalTemplate();
  // The template picked last: a slow answer for an earlier pick must not fill the list
  const latestPick = useRef<string | null>(value?.templateId ?? null);
  if (isError || !templates || templates.length === 0) return null;

  const selected = templates.find((t) => t.id === value?.templateId);
  const resolved = value && resolvedTemplate?.template.id === value.templateId ? resolvedTemplate.metrics : undefined;
  // Once resolved, only tests that can really be added are offered; until then the ticks wait
  const unavailableKeys = new Set(resolved?.filter((m) => m.status !== "available").map((m) => m.metricKey));
  const optional = selected?.metrics.filter((m) => !m.isRequired && !unavailableKeys.has(m.metricKey)) ?? [];
  const hasSingleLegPair = SINGLE_LEG_CMJ_KEYS.every((k) => optional.some((m) => m.metricKey === k));
  const unavailable = resolved ? unavailableTests(resolved) : null;

  const chooseTemplate = async (id: string) => {
    latestPick.current = id === NONE ? null : id;
    if (id === NONE) {
      onChange(null);
      onSelectedMetricsChange(clearTemplateEntries);
      return;
    }
    onChange({ templateId: id, includeOptional: [] });
    // Drop the previous template's tests right away; the new ones arrive when the template is resolved
    onSelectedMetricsChange(clearTemplateEntries);
    try {
      const answer = await fetchResolved(id);
      if (latestPick.current !== id) return;
      onSelectedMetricsChange((list) => replaceTemplateEntries(list, answer.metrics, []));
    } catch {
      // The query reports the failure below; nothing is added
    }
  };

  const toggleOptional = (key: string, checked: boolean) => {
    if (!value || !resolved) return;
    const next = checked ? [...value.includeOptional, key] : value.includeOptional.filter((k) => k !== key);
    onChange({ templateId: value.templateId, includeOptional: next });
    onSelectedMetricsChange((list) => setOptionalEntry(list, resolved, key, checked));
  };

  return (
    <div className="space-y-3 rounded-lg border p-4" data-testid="eval-template-picker">
      <div className="space-y-2">
        <Label htmlFor="eval-template-select">Start from template (optional)</Label>
        <Select
          value={value?.templateId ?? NONE}
          onValueChange={chooseTemplate}
        >
          <SelectTrigger id="eval-template-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No template</SelectItem>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Fills the tests below. Add or remove tests before you create the event.</p>
        {value && resolveFailed && (
          <p role="alert" className="text-xs text-destructive">
            Could not load this template's tests. Nothing was added; pick the template again or add tests by hand.
          </p>
        )}
        {unavailable && unavailable.notAvailableYet.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Not available yet: {unavailable.notAvailableYet.map((m) => templateMetricLabel(m)).join(", ")}
          </p>
        )}
        {unavailable && unavailable.calculated.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Calculated automatically, nothing to enter: {unavailable.calculated.map((m) => templateKeyLabel(m.metricKey, m.customLabel)).join(", ")}
          </p>
        )}
      </div>

      {value && optional.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Include optional tests</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {optional.map((m) => (
              <div key={m.metricKey} className="flex items-center gap-2">
                <Checkbox
                  id={`eval-optional-${m.metricKey}`}
                  checked={value.includeOptional.includes(m.metricKey)}
                  disabled={resolving || !resolved}
                  onCheckedChange={(c) => toggleOptional(m.metricKey, c === true)}
                />
                <Label htmlFor={`eval-optional-${m.metricKey}`} className="cursor-pointer font-normal">
                  {templateMetricLabel(m)}
                </Label>
              </div>
            ))}
          </div>
          {hasSingleLegPair && (
            <p className="text-xs text-muted-foreground">Use one single-leg jump side per athlete, left or right, not both.</p>
          )}
        </fieldset>
      )}
    </div>
  );
}
