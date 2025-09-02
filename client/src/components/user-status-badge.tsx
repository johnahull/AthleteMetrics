
import React from "react";
import { Badge } from "@/components/ui/badge";

interface UserStatusBadgeProps {
  isActive: boolean | string;
  size?: "sm" | "default";
}

export function UserStatusBadge({ isActive, size = "default" }: UserStatusBadgeProps) {
  const active = isActive === true || isActive === "true";
  
  return (
    <Badge 
      variant={active ? "default" : "secondary"}
      className={size === "sm" ? "text-xs" : ""}
    >
      {active ? "Active" : "Inactive"}
    </Badge>
  );
}
