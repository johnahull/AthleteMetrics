import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowUp, Target } from "lucide-react";
import { cn } from "@/lib/utils";

interface BenchmarkComparisonProps {
  athleteValue: number | null;
  benchmarkValue: number;
  comparisonOperator: 'lte' | 'gte' | 'eq';
  metricCode: string;
  isMet: boolean;
}

export function BenchmarkComparison({
  athleteValue,
  benchmarkValue,
  comparisonOperator,
  metricCode,
  isMet,
}: BenchmarkComparisonProps) {
  // Format operator for display
  const operatorSymbol = {
    lte: "≤",
    gte: "≥",
    eq: "=",
  }[comparisonOperator];

  const operatorText = {
    lte: "Lower is better",
    gte: "Higher is better",
    eq: "Exact target",
  }[comparisonOperator];

  // Calculate difference
  const difference = athleteValue !== null
    ? Math.abs(athleteValue - benchmarkValue)
    : null;

  // Determine if ahead or behind
  const getStatus = () => {
    if (athleteValue === null) {
      return { text: "No measurement recorded", icon: null, color: "text-muted-foreground" };
    }

    if (isMet) {
      if (comparisonOperator === "lte") {
        return {
          text: `${difference?.toFixed(3)} faster than target`,
          icon: <ArrowDown className="h-4 w-4" />,
          color: "text-green-600",
        };
      } else if (comparisonOperator === "gte") {
        return {
          text: `${difference?.toFixed(3)} above target`,
          icon: <ArrowUp className="h-4 w-4" />,
          color: "text-green-600",
        };
      } else {
        return {
          text: "Exact match!",
          icon: <Target className="h-4 w-4" />,
          color: "text-green-600",
        };
      }
    } else {
      if (comparisonOperator === "lte") {
        return {
          text: `${difference?.toFixed(3)} slower than target`,
          icon: <ArrowUp className="h-4 w-4" />,
          color: "text-orange-600",
        };
      } else if (comparisonOperator === "gte") {
        return {
          text: `${difference?.toFixed(3)} below target`,
          icon: <ArrowDown className="h-4 w-4" />,
          color: "text-orange-600",
        };
      } else {
        return {
          text: `${difference?.toFixed(3)} away from target`,
          icon: null,
          color: "text-orange-600",
        };
      }
    }
  };

  const status = getStatus();

  return (
    <div className="bg-muted p-4 rounded-md space-y-3">
      {/* Values */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-muted-foreground mb-1">Your Value</div>
          <div className="text-2xl font-bold">
            {athleteValue !== null ? athleteValue.toFixed(3) : "—"}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">
            Target {operatorSymbol}
          </div>
          <div className="text-2xl font-bold">{benchmarkValue}</div>
        </div>
      </div>

      {/* Status */}
      <div className={cn("flex items-center gap-2 text-sm font-medium", status.color)}>
        {status.icon}
        <span>{status.text}</span>
      </div>

      {/* Operator Info */}
      <div className="text-xs text-muted-foreground">
        {operatorText} ({operatorSymbol})
      </div>
    </div>
  );
}
