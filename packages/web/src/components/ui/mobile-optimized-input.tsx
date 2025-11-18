import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export interface MobileOptimizedInputProps extends React.ComponentProps<"input"> {
  /**
   * Input type for mobile keyboard optimization
   * - 'email': Shows email keyboard with @ symbol
   * - 'tel': Shows numeric keyboard with phone symbols
   * - 'number': Shows numeric keyboard
   * - 'url': Shows URL keyboard with .com/.org shortcuts
   * - 'search': Shows search keyboard with search button
   */
  mobileType?: 'email' | 'tel' | 'number' | 'url' | 'search' | 'text';

  /**
   * Pattern for numeric inputs (helps mobile browsers)
   */
  inputMode?: 'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url';
}

const MobileOptimizedInput = React.forwardRef<HTMLInputElement, MobileOptimizedInputProps>(
  ({ className, type, mobileType, inputMode, ...props }, ref) => {
    // Determine optimal input attributes for mobile
    const getInputMode = (): 'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url' | undefined => {
      if (inputMode) return inputMode;

      switch (mobileType || type) {
        case 'email':
          return 'email';
        case 'tel':
          return 'tel';
        case 'number':
          return 'numeric';
        case 'url':
          return 'url';
        case 'search':
          return 'search';
        default:
          return 'text';
      }
    };

    const getType = (): string => {
      // Use mobileType if provided, otherwise use type
      return mobileType || type || 'text';
    };

    return (
      <Input
        type={getType()}
        inputMode={getInputMode()}
        className={cn(
          // Increased touch target height on mobile
          "min-h-[44px] md:min-h-[36px]",
          // Larger text on mobile for readability
          "text-base md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

MobileOptimizedInput.displayName = "MobileOptimizedInput";

export { MobileOptimizedInput };
