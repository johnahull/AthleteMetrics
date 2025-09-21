import React, { Suspense } from "react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

interface RouteWrapperProps {
  children: React.ReactNode;
  loadingText?: string;
}

/**
 * Reusable route wrapper that provides consistent Suspense boundaries
 * for lazy-loaded routes with proper loading states
 */
export function RouteWrapper({ children, loadingText = "Loading..." }: RouteWrapperProps) {
  return (
    <Suspense fallback={<LoadingSpinner text={loadingText} />}>
      {children}
    </Suspense>
  );
}