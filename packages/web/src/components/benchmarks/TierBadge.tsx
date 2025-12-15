import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, Award, Target, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface TierBadgeProps {
  tierName: string;
  tierColor: string;
  tierOrder?: number;
  nextTierName?: string | null;
  distanceToNextTier?: number | null;
  unit?: string;
  lowerIsBetter?: boolean;
  showProgress?: boolean;
}

// Map tier colors to Tailwind classes
const colorClasses: Record<string, { bg: string; hover: string; text: string }> = {
  gold: { bg: "bg-amber-500", hover: "hover:bg-amber-600", text: "text-amber-900" },
  emerald: { bg: "bg-emerald-500", hover: "hover:bg-emerald-600", text: "text-emerald-900" },
  silver: { bg: "bg-slate-400", hover: "hover:bg-slate-500", text: "text-slate-900" },
  blue: { bg: "bg-blue-500", hover: "hover:bg-blue-600", text: "text-blue-900" },
  bronze: { bg: "bg-orange-600", hover: "hover:bg-orange-700", text: "text-orange-900" },
  amber: { bg: "bg-amber-600", hover: "hover:bg-amber-700", text: "text-amber-900" },
  slate: { bg: "bg-slate-500", hover: "hover:bg-slate-600", text: "text-slate-900" },
  gray: { bg: "bg-gray-500", hover: "hover:bg-gray-600", text: "text-gray-900" },
};

// Icon for tier order (1=best gets trophy, 2=silver medal, 3=bronze award, etc.)
function TierIcon({ tierOrder }: { tierOrder?: number }) {
  switch (tierOrder) {
    case 1:
      return <Trophy className="h-3 w-3" />;
    case 2:
      return <Medal className="h-3 w-3" />;
    case 3:
      return <Award className="h-3 w-3" />;
    default:
      return <Target className="h-3 w-3" />;
  }
}

export function TierBadge({
  tierName,
  tierColor,
  tierOrder,
  nextTierName,
  distanceToNextTier,
  unit = "",
  lowerIsBetter = true,
  showProgress = true,
}: TierBadgeProps) {
  const colors = colorClasses[tierColor.toLowerCase()] || colorClasses.gray;

  // Format distance for display
  const formatDistance = (distance: number): string => {
    if (Math.abs(distance) < 0.01) {
      return distance.toFixed(3);
    }
    if (Math.abs(distance) < 1) {
      return distance.toFixed(2);
    }
    return distance.toFixed(1);
  };

  // Direction text based on whether lower or higher is better
  const directionText = lowerIsBetter ? "faster" : "more";

  return (
    <div className="flex flex-col gap-1">
      {/* Main tier badge */}
      <Badge className={cn(colors.bg, colors.hover, "flex items-center gap-1 text-white")}>
        <TierIcon tierOrder={tierOrder} />
        {tierName}
      </Badge>

      {/* Progress to next tier (if not at best tier) */}
      {showProgress && nextTierName && distanceToNextTier !== null && distanceToNextTier !== undefined && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <ArrowUp className="h-3 w-3" />
          <span>
            {formatDistance(distanceToNextTier)}
            {unit && ` ${unit}`} to {nextTierName}
          </span>
        </div>
      )}
    </div>
  );
}

// Compact version for inline display
export function TierBadgeCompact({
  tierName,
  tierColor,
}: Pick<TierBadgeProps, "tierName" | "tierColor">) {
  const colors = colorClasses[tierColor.toLowerCase()] || colorClasses.gray;

  return (
    <Badge className={cn(colors.bg, colors.hover, "text-white text-xs")}>
      {tierName}
    </Badge>
  );
}
