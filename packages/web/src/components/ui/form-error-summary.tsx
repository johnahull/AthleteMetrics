import * as React from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FormError {
  field: string;
  message: string;
  ref?: React.RefObject<HTMLElement>;
}

export interface FormErrorSummaryProps {
  errors: FormError[];
  onErrorClick?: (field: string) => void;
  className?: string;
}

export function FormErrorSummary({
  errors,
  onErrorClick,
  className,
}: FormErrorSummaryProps) {
  // Don't render anything if there are no errors
  if (errors.length === 0) {
    return null;
  }

  const errorCount = errors.length;
  const errorText = errorCount === 1 ? "error" : "errors";

  return (
    <div
      className={cn(
        "mb-4 p-4 border border-red-300 bg-red-50 rounded-md max-h-60 overflow-y-auto",
        className
      )}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start">
        <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-semibold text-red-800">
            Please fix the following {errorCount} {errorText}:
          </h3>
          <ul className="mt-2 text-sm text-red-700 list-disc list-inside space-y-1">
            {errors.map((error, index) => (
              <li key={index} className="truncate">
                {onErrorClick ? (
                  <button
                    type="button"
                    className="hover:underline focus:outline-none focus:underline"
                    onClick={() => onErrorClick(error.field)}
                  >
                    {error.message}
                  </button>
                ) : (
                  error.message
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
