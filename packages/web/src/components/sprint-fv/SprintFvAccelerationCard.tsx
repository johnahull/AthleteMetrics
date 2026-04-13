import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Timer, Zap, Ruler, Lightbulb } from 'lucide-react';
import type { SprintFvProfile } from '@/lib/sprint-fv-api';
import { useUnitSystem } from '@/contexts/UnitSystemContext';

interface Props {
  profile: SprintFvProfile;
}

const ratingColors = {
  explosive: 'bg-green-100 text-green-800',
  fast: 'bg-blue-100 text-blue-800',
  average: 'bg-amber-100 text-amber-800',
  slow: 'bg-red-100 text-red-800',
};

export function SprintFvAccelerationCard({ profile }: Props) {
  const analysis = profile.analysisJson?.accelerationProfile;
  const units = useUnitSystem();
  if (!analysis) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Acceleration Analysis</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Key metrics */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge className={`text-sm px-3 py-1 ${ratingColors[analysis.tauRating]}`}>
                {analysis.tauRating.charAt(0).toUpperCase() + analysis.tauRating.slice(1)} Acceleration
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Timer className="h-3 w-3" />
                  <span>Time Constant (τ)</span>
                </div>
                <div className="text-lg font-bold">{analysis.tau.toFixed(2)}s</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Zap className="h-3 w-3" />
                  <span>90% V<sub>max</sub></span>
                </div>
                <div className="text-lg font-bold">{analysis.timeTo90Pct.toFixed(2)}s</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Ruler className="h-3 w-3" />
                  <span>Accel. Distance</span>
                </div>
                <div className="text-lg font-bold">
                  {units.system === 'imperial'
                    ? `${(analysis.accelerationPhaseM * 1.09361).toFixed(1)} yd`
                    : `${analysis.accelerationPhaseM.toFixed(1)} m`}
                </div>
              </div>
            </div>
          </div>

          {/* Training insights */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-1.5">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              Training Insights
            </h4>
            <ul className="space-y-2">
              {analysis.trainingInsights.map((insight, i) => (
                <li key={i} className="text-sm text-muted-foreground leading-relaxed">
                  {insight}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
