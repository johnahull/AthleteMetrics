/**
 * EvalTemplatePicker - optional "Start from template" choice on the new-event form (AM-FEAT-019 P5).
 * Offers the organization's eval battery templates and the global default. Optional tests are off unless ticked.
 * Renders nothing when the templates cannot be read (a non-writer) or there are none.
 */

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEvalTemplates } from "@/hooks/use-eval-report";
import { SINGLE_LEG_CMJ_KEYS, templateMetricLabel } from "@/lib/eval-template-labels";

export interface EvalTemplateChoice {
  templateId: string;
  /** Template keys of the optional metrics to add on top of the required ones */
  includeOptional: string[];
}

interface EvalTemplatePickerProps {
  organizationId: string | undefined;
  value: EvalTemplateChoice | null;
  onChange: (value: EvalTemplateChoice | null) => void;
}

const NONE = "none";

export function EvalTemplatePicker({ organizationId, value, onChange }: EvalTemplatePickerProps) {
  const { data: templates, isError } = useEvalTemplates(organizationId);
  if (isError || !templates || templates.length === 0) return null;

  const selected = templates.find((t) => t.id === value?.templateId);
  const optional = selected?.metrics.filter((m) => !m.isRequired) ?? [];
  const hasSingleLegPair = SINGLE_LEG_CMJ_KEYS.every((k) => optional.some((m) => m.metricKey === k));

  const toggleOptional = (key: string, checked: boolean) => {
    if (!value) return;
    const next = checked ? [...value.includeOptional, key] : value.includeOptional.filter((k) => k !== key);
    onChange({ templateId: value.templateId, includeOptional: next });
  };

  return (
    <div className="space-y-3 rounded-lg border p-4" data-testid="eval-template-picker">
      <div className="space-y-2">
        <Label htmlFor="eval-template-select">Start from template (optional)</Label>
        <Select
          value={value?.templateId ?? NONE}
          onValueChange={(id) => onChange(id === NONE ? null : { templateId: id, includeOptional: [] })}
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
        <p className="text-xs text-muted-foreground">Adds the template's required tests to the event after it is created.</p>
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
