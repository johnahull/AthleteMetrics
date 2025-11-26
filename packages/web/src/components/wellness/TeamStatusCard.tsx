import { useState, memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ChevronDown, ChevronUp } from 'lucide-react';
import TeamAthleteList from './TeamAthleteList';
import { TrendIndicator, ScoreDisplay, StatusDot } from './ui/WellnessUIComponents';

interface AthleteData {
  id: string;
  name: string;
  status: 'red' | 'yellow' | 'green';
  score: number | null;
  injuries: { x: number; y: number; label?: string }[];
  lastSubmission: Date;
}

interface TeamStatusCardProps {
  teamId: string;
  teamName: string;
  teamStatus: 'red' | 'yellow' | 'green';
  teamAverageScore: number | null;
  scaleMax: number;
  redCount: number;
  yellowCount: number;
  greenCount: number;
  totalAthletes: number;
  completionRate: number;
  trend: 'up' | 'down' | 'stable';
  commonInjuries: { label: string; count: number }[];
  athletes: AthleteData[];
  isLoading?: boolean;
  onExpand?: (teamId: string) => void;
}

const TeamStatusCard = memo(function TeamStatusCard({
  teamId,
  teamName,
  teamStatus,
  teamAverageScore,
  scaleMax,
  redCount,
  yellowCount,
  greenCount,
  totalAthletes,
  completionRate,
  trend,
  commonInjuries,
  athletes,
  isLoading = false,
  onExpand,
}: TeamStatusCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // teamStatus is now calculated by API based on average of athlete scores

  const statusConfig = {
    red: { label: 'At Risk', bgClass: 'bg-red-100', textClass: 'text-red-800' },
    yellow: { label: 'Caution', bgClass: 'bg-yellow-100', textClass: 'text-yellow-800' },
    green: { label: 'Good', bgClass: 'bg-green-100', textClass: 'text-green-800' },
  };

  const handleToggleExpand = () => {
    setIsExpanded(!isExpanded);
    if (!isExpanded && onExpand) {
      onExpand(teamId);
    }
  };

  const submittedCount = Math.round((completionRate / 100) * totalAthletes);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">{teamName}</CardTitle>
          </div>
          <Badge className={`${statusConfig[teamStatus].bgClass} ${statusConfig[teamStatus].textClass} border-0`}>
            <div className="mr-2">
              <StatusDot status={teamStatus} />
            </div>
            {statusConfig[teamStatus].label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Team Average Score */}
        {teamAverageScore !== null && (
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <span className="text-sm font-medium text-gray-700">Team Average Score</span>
            <span className="text-lg text-gray-900">
              <ScoreDisplay score={teamAverageScore} max={scaleMax} className="font-bold" />
            </span>
          </div>
        )}

        {/* Athlete Status Counts */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1">
            <StatusDot status="red" />
            <span className="font-medium">{redCount}</span>
            <span className="text-gray-600">red</span>
          </div>
          <div className="flex items-center gap-1">
            <StatusDot status="yellow" />
            <span className="font-medium">{yellowCount}</span>
            <span className="text-gray-600">yellow</span>
          </div>
          <div className="flex items-center gap-1">
            <StatusDot status="green" />
            <span className="font-medium">{greenCount}</span>
            <span className="text-gray-600">green</span>
          </div>
        </div>

        {/* Completion Rate */}
        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-gray-600">Completion Rate</span>
            <span className="font-medium">{completionRate}%</span>
          </div>
          <Progress value={completionRate} className="h-2" />
          <p className="text-xs text-gray-500 mt-1">
            {submittedCount} of {totalAthletes} athletes
          </p>
        </div>

        {/* Trend */}
        <div className="text-sm">
          <TrendIndicator trend={trend} />
        </div>

        {/* Common Injuries */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Common Injuries</p>
          {commonInjuries.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {commonInjuries.map((injury, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  {injury.label} ({injury.count})
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No injuries reported</p>
          )}
        </div>

        {/* Expand/Collapse Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleToggleExpand}
          className="w-full"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-4 h-4 mr-2" />
              Hide Athletes
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4 mr-2" />
              View Athletes ({athletes.length})
            </>
          )}
        </Button>

        {/* Athlete List (Expanded) */}
        {isExpanded && (
          <div className="border-t pt-4">
            <TeamAthleteList athletes={athletes} />
          </div>
        )}
      </CardContent>
    </Card>
  );
});

export default TeamStatusCard;

