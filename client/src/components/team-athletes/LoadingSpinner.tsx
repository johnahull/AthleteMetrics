import React from "react";

interface LoadingSpinnerProps {
  text?: string;
  className?: string;
}

export function LoadingSpinner({
  text = "Loading...",
  className = "flex items-center justify-center py-8"
}: LoadingSpinnerProps) {
  return (
    <div className={className}>
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" aria-hidden="true"></div>
      <span className="ml-2">{text}</span>
    </div>
  );
}