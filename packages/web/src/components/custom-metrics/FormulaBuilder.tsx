import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFormulaSources, useValidateFormula } from "@/lib/custom-metrics-api";
import { Check, AlertTriangle, X, HelpCircle } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface FormulaBuilderProps {
  organizationId: string;
  value: string;
  onChange: (value: string) => void;
  excludeCode?: string; // Exclude self when editing
  disabled?: boolean;
}

export function FormulaBuilder({
  organizationId,
  value,
  onChange,
  excludeCode,
  disabled,
}: FormulaBuilderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");

  const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { data: sources } = useFormulaSources(organizationId);
  const validateMutation = useValidateFormula();
  const validateFormula = validateMutation.mutate;

  // Cleanup blur timeout on unmount
  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  // Filter sources based on search and exclude self
  const availableMetrics = sources?.availableMetrics?.filter(
    (m) => m.code !== excludeCode
  ) || [];

  const filteredMetrics = availableMetrics.filter((m) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      m.code.toLowerCase().includes(term) ||
      m.label.toLowerCase().includes(term)
    );
  });

  // Debounced validation
  useEffect(() => {
    if (!value) return;

    const timer = setTimeout(() => {
      validateFormula({
        organizationId,
        formula: value,
        excludeCode,
      });
    }, 500);

    return () => clearTimeout(timer);
  }, [value, organizationId, excludeCode, validateFormula]);

  // Extract current word at cursor for autocomplete
  const getCurrentWord = () => {
    if (!inputRef.current) return "";
    const input = inputRef.current;
    const text = input.value;
    const pos = input.selectionStart || 0;

    // Find word boundaries
    let start = pos;
    let end = pos;

    // Go back to find start of word
    while (start > 0 && /[\w_]/.test(text[start - 1])) {
      start--;
    }

    // Go forward to find end of word
    while (end < text.length && /[\w_]/.test(text[end])) {
      end++;
    }

    return text.slice(start, end);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setCursorPosition(e.target.selectionStart || 0);
    setSearchTerm(getCurrentWord());
  };

  const handleInputFocus = () => {
    setSearchTerm(getCurrentWord());
    setShowSuggestions(true);
  };

  const handleInputBlur = useCallback(() => {
    // Delay to allow click on suggestion
    blurTimeoutRef.current = setTimeout(() => setShowSuggestions(false), 150);
  }, []);

  const insertMetricCode = (code: string) => {
    if (!inputRef.current) return;

    const input = inputRef.current;
    const text = input.value;
    const pos = cursorPosition;

    // Find current word boundaries to replace
    let start = pos;
    let end = pos;

    while (start > 0 && /[\w_]/.test(text[start - 1])) {
      start--;
    }
    while (end < text.length && /[\w_]/.test(text[end])) {
      end++;
    }

    // Replace current word with metric code
    const newValue = text.slice(0, start) + code + text.slice(end);
    onChange(newValue);

    // Move cursor after inserted code
    setTimeout(() => {
      input.focus();
      input.setSelectionRange(start + code.length, start + code.length);
    }, 0);

    setShowSuggestions(false);
    setSearchTerm("");
  };

  const validationData = validateMutation.data;
  const isValid = validationData?.isValid;
  const errors = validationData?.errors || [];
  const warnings = validationData?.warnings || [];
  const referencedMetrics = validationData?.referencedMetrics || [];

  return (
    <div className="space-y-2">
      <div className="relative">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Input
              ref={inputRef}
              value={value}
              onChange={handleInputChange}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              placeholder="e.g., FLY10_TIME * 2.5 + VERTICAL_JUMP / 10"
              disabled={disabled}
              className={cn(
                "font-mono text-sm",
                value && (isValid === true ? "border-green-500" : isValid === false ? "border-red-500" : "")
              )}
            />

            {/* Validation indicator */}
            {value && validateMutation.isPending && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            )}
            {value && !validateMutation.isPending && isValid === true && (
              <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
            )}
            {value && !validateMutation.isPending && isValid === false && (
              <X className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
            )}
          </div>

          {/* Help popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="icon" aria-label="Formula syntax help">
                <HelpCircle className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <div className="space-y-3">
                <h4 className="font-semibold">Formula Syntax</h4>
                <div className="text-sm space-y-2">
                  <p className="text-muted-foreground">
                    Use metric codes and mathematical operators to create derived metrics.
                  </p>
                  <div className="space-y-1">
                    <p className="font-medium">Operators:</p>
                    <code className="text-xs bg-muted p-1 rounded">+ - * / ( )</code>
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium">Example:</p>
                    <code className="text-xs bg-muted p-1 rounded block">
                      (FLY10_TIME + DASH_40YD) / 2
                    </code>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Autocomplete dropdown */}
        {showSuggestions && filteredMetrics.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
            {filteredMetrics.slice(0, 10).map((metric) => (
              <button
                key={metric.code}
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-accent flex items-center justify-between text-sm"
                onMouseDown={() => insertMetricCode(metric.code)}
              >
                <span>
                  <span className="font-mono">{metric.code}</span>
                  <span className="text-muted-foreground ml-2">– {metric.label}</span>
                </span>
                {metric.isCustom && (
                  <Badge variant="secondary" className="text-xs">Custom</Badge>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="text-sm text-red-500 space-y-1">
          {errors.map((error, idx) => (
            <p key={idx} className="flex items-center gap-1">
              <X className="h-3 w-3" />
              {error}
            </p>
          ))}
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="text-sm text-yellow-600 space-y-1">
          {warnings.map((warning, idx) => (
            <p key={idx} className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {warning}
            </p>
          ))}
        </div>
      )}

      {/* Referenced metrics */}
      {isValid && referencedMetrics.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <span className="text-xs text-muted-foreground">Uses:</span>
          {referencedMetrics.map((code) => (
            <TooltipProvider key={code}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-xs font-mono">
                    {code}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {availableMetrics.find((m) => m.code === code)?.label || code}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </div>
      )}
    </div>
  );
}
