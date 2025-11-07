import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, TrendingUp } from "lucide-react";

interface BenchmarkBadgeProps {
  isMet: boolean;
  progress: number;
}

export function BenchmarkBadge({ isMet, progress }: BenchmarkBadgeProps) {
  if (isMet) {
    if (progress > 110) {
      // Exceeding benchmark significantly
      return (
        <Badge className="bg-emerald-600 hover:bg-emerald-700 flex items-center gap-1">
          <TrendingUp className="h-3 w-3" />
          Exceeding
        </Badge>
      );
    }
    // Met benchmark
    return (
      <Badge className="bg-green-600 hover:bg-green-700 flex items-center gap-1">
        <CheckCircle className="h-3 w-3" />
        Met
      </Badge>
    );
  }

  // Not met
  return (
    <Badge variant="secondary" className="flex items-center gap-1">
      <XCircle className="h-3 w-3" />
      Not Met
    </Badge>
  );
}
