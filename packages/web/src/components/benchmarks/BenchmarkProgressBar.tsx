import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface BenchmarkProgressBarProps {
  progress: number;
  isMet: boolean;
  comparisonOperator: 'lte' | 'gte' | 'eq';
}

export function BenchmarkProgressBar({
  progress,
  isMet,
  comparisonOperator,
}: BenchmarkProgressBarProps) {
  // Cap progress at 150% for display purposes (>100% means exceeding)
  const displayProgress = Math.min(progress, 150);

  // Determine color based on progress and operator
  const getProgressColor = () => {
    if (isMet) {
      return "bg-green-600"; // Met the benchmark
    } else if (progress >= 75) {
      return "bg-yellow-600"; // Close to meeting
    } else {
      return "bg-orange-600"; // Not close
    }
  };

  // Format progress text
  const getProgressText = () => {
    if (comparisonOperator === "eq") {
      return isMet ? "Exact Match" : `${progress.toFixed(0)}% Match`;
    }

    if (progress >= 100) {
      return `${progress.toFixed(0)}% (Exceeding Goal)`;
    } else {
      return `${progress.toFixed(0)}% of Goal`;
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center text-sm">
        <span className="font-medium">Progress</span>
        <span className={cn("font-semibold", isMet && "text-green-600")}>
          {getProgressText()}
        </span>
      </div>
      <div className="relative">
        {/* Custom progress bar since we need dynamic colors */}
        <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={cn("h-full transition-all", getProgressColor())}
            style={{ width: `${displayProgress}%` }}
          />
        </div>
        {progress > 100 && (
          <div
            className="absolute top-0 left-[100%] w-px h-3 bg-border"
            title="100% Goal Line"
          />
        )}
      </div>
    </div>
  );
}
