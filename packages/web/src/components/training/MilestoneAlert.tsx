/**
 * MilestoneAlert
 *
 * Dismissable Alert banner shown on workout completion.
 * Props: show, type ('streak' | 'phase_complete'), onDismiss.
 * Uses shadcn Alert component.
 */

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Trophy, Flame, X } from "lucide-react";

interface MilestoneAlertProps {
  show: boolean;
  type: "streak" | "phase_complete";
  onDismiss: () => void;
}

const MILESTONE_CONFIG = {
  streak: {
    icon: Flame,
    title: "Streak Milestone!",
    description: "You've completed 5 consecutive training sessions. Keep the momentum going!",
    colorClass: "border-orange-200 bg-orange-50 text-orange-800",
    iconClass: "text-orange-500",
  },
  phase_complete: {
    icon: Trophy,
    title: "Phase Complete!",
    description: "You've finished your training phase. Outstanding dedication to your development!",
    colorClass: "border-yellow-200 bg-yellow-50 text-yellow-800",
    iconClass: "text-yellow-500",
  },
} as const;

export function MilestoneAlert({ show, type, onDismiss }: MilestoneAlertProps) {
  if (!show) return null;

  const config = MILESTONE_CONFIG[type];
  const Icon = config.icon;

  return (
    <Alert
      className={`relative ${config.colorClass}`}
      data-testid={`milestone-alert-${type}`}
      role="alert"
    >
      <Icon className={`h-4 w-4 ${config.iconClass}`} />
      <AlertTitle className="font-semibold pr-8">{config.title}</AlertTitle>
      <AlertDescription>{config.description}</AlertDescription>
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-2 right-2 h-6 w-6 p-0 hover:bg-black/10"
        onClick={onDismiss}
        aria-label="Dismiss milestone alert"
        data-testid={`milestone-alert-dismiss-${type}`}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </Alert>
  );
}
