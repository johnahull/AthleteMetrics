import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { ChartItem, ChartItemKey } from "./chart-items";

interface ChartChoicesProps {
  items: ReadonlyArray<ChartItem>;
  value: Partial<Record<ChartItemKey, boolean>> | undefined;
  onChange: (key: ChartItemKey, checked: boolean) => void;
  /** A disabled chart shows unchecked */
  isDisabled?: (key: ChartItemKey) => boolean;
  /** Keeps checkbox ids unique when team and individual choices share a page. Default ids are `chart-<key>`. */
  idPrefix?: string;
}

export function ChartChoices({ items, value, onChange, isDisabled, idPrefix }: ChartChoicesProps) {
  return (
    <>
      {items.map(([key, title, desc]) => {
        const id = `${idPrefix ? `${idPrefix}-` : ""}chart-${key}`;
        const disabled = isDisabled?.(key) ?? false;
        return (
          <div key={key} className="flex items-start gap-x-2">
            <Checkbox
              id={id}
              checked={!disabled && (value?.[key] ?? true)}
              disabled={disabled}
              onCheckedChange={(v) => onChange(key, v as boolean)}
              className="mt-1"
            />
            <div>
              <Label htmlFor={id} className="cursor-pointer font-medium">{title}</Label>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
          </div>
        );
      })}
    </>
  );
}
