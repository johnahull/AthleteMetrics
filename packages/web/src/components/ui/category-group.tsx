import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";

interface ToggleProps {
  title: string;
  count: number;
  /** Singular noun for the count, e.g. "metric" -> "3 metrics". */
  unit: string;
  open: boolean;
  onToggle: () => void;
  /** id of the region this button shows or hides (needed when the region is not a Collapsible, e.g. table rows). */
  controlsId?: string;
  headingLevel?: 2 | 3;
}

const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"}`;

/** Heading + button for one category. Shared by the card lists and the table section rows. */
export function CategoryGroupToggle({ title, count, unit, open, onToggle, controlsId, headingLevel = 2 }: ToggleProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <Heading className="m-0 text-base font-semibold">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={controlsId}
        aria-label={`${title}, ${plural(count, unit)}`}
        className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0" aria-hidden /> : <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />}
        <span>{title}</span>
        <span className="text-sm font-normal text-muted-foreground" aria-hidden>
          {count}
        </span>
      </button>
    </Heading>
  );
}

interface GroupProps extends Omit<ToggleProps, "onToggle" | "controlsId"> {
  id: string;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

/** Controlled, collapsible category section. Collapsed content is unmounted. */
export function CategoryGroup({ id, onOpenChange, children, open, ...toggle }: GroupProps) {
  // aria-controls is a space-separated IDREF list, so custom category ids (free text) must not contain whitespace
  const regionId = `category-group-${id.replace(/\s+/g, "-")}`;
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="mb-4" data-testid={`category-group-${id}`}>
      <CategoryGroupToggle {...toggle} open={open} controlsId={regionId} onToggle={() => onOpenChange(!open)} />
      <CollapsibleContent id={regionId} className="pt-2">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
