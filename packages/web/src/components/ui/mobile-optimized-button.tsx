import * as React from "react";
import { cn } from "@/lib/utils";
import { Button, ButtonProps } from "@/components/ui/button";

export interface MobileOptimizedButtonProps extends ButtonProps {
  /**
   * Ensures minimum 48px touch target on mobile (WCAG 2.1 AA)
   */
  touchOptimized?: boolean;
}

const MobileOptimizedButton = React.forwardRef<HTMLButtonElement, MobileOptimizedButtonProps>(
  ({ className, touchOptimized = true, size, ...props }, ref) => {
    return (
      <Button
        size={size}
        className={cn(
          // Ensure minimum 48px touch target on mobile
          touchOptimized && "min-h-[48px] md:min-h-[36px]",
          // Slightly larger padding on mobile
          touchOptimized && "px-6 md:px-4",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

MobileOptimizedButton.displayName = "MobileOptimizedButton";

export { MobileOptimizedButton };
