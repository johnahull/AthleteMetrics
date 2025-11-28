import * as React from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

interface ResponsiveDialogProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}

interface ResponsiveDialogContentProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  description?: string;
}

/**
 * ResponsiveDialog automatically switches between Dialog (desktop) and Drawer (mobile)
 * based on viewport size. Provides consistent API regardless of implementation.
 */
export function ResponsiveDialog({
  children,
  open,
  onOpenChange,
  trigger,
}: ResponsiveDialogProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        {trigger && <DrawerTrigger asChild>{trigger}</DrawerTrigger>}
        {children}
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      {children}
    </Dialog>
  );
}

/**
 * ResponsiveDialogContent renders appropriate content wrapper
 * (DialogContent on desktop, DrawerContent on mobile)
 */
export function ResponsiveDialogContent({
  children,
  className,
  title,
  description,
}: ResponsiveDialogContentProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <DrawerContent className={className}>
        {(title || description) && (
          <DrawerHeader>
            {title && <DrawerTitle>{title}</DrawerTitle>}
            {description && <DrawerDescription>{description}</DrawerDescription>}
          </DrawerHeader>
        )}
        <div className="px-4 pb-4">{children}</div>
      </DrawerContent>
    );
  }

  return (
    <DialogContent className={className}>
      {(title || description) && (
        <DialogHeader>
          {title && <DialogTitle>{title}</DialogTitle>}
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
      )}
      {children}
    </DialogContent>
  );
}

// Export for convenience
export {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
