import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle, XCircle, TrendingUp } from "lucide-react";

interface BenchmarkBadgeProps {
  isMet: boolean;
  progress: number;
}

export function BenchmarkBadge({ isMet, progress }: BenchmarkBadgeProps) {
  if (isMet) {
    if (progress > 110) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge className="bg-emerald-600 hover:bg-emerald-700 flex items-center gap-1 cursor-help">
                <TrendingUp className="h-3 w-3" />
                Exceeding
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>You&apos;re performing above the D1 benchmark — elite-level territory.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge className="bg-green-600 hover:bg-green-700 flex items-center gap-1 cursor-help">
              <CheckCircle className="h-3 w-3" />
              Met
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>You&apos;ve reached the D1 standard for this metric. Keep building.</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="secondary" className="flex items-center gap-1 cursor-help">
            <XCircle className="h-3 w-3" />
            Not Met
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>Below D1 standard — this is a target for your next training block.</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
