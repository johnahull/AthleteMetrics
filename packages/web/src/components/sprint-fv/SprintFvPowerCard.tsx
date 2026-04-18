import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BatteryCharging, Target, TrendingDown, Lightbulb } from 'lucide-react';
import type { SprintFvProfile } from '@/lib/sprint-fv-api';
import { useUnitSystem } from '@/contexts/UnitSystemContext';

interface Props {
  profile: SprintFvProfile;
}

const ratingColors = {
  excellent: 'bg-green-100 text-green-800',
  good: 'bg-blue-100 text-blue-800',
  average: 'bg-amber-100 text-amber-800',
  poor: 'bg-red-100 text-red-800',
};

export function SprintFvPowerCard({ profile }: Props) {
  const analysis = profile.analysisJson?.powerProfile;
  const units = useUnitSystem();
  if (!analysis) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Power & Force Efficiency</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Key metrics */}
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <BatteryCharging className="h-3 w-3" />
                  <span>P<sub>max</sub></span>
                </div>
                <div className="text-lg font-bold">{analysis.pmaxRel.toFixed(1)}</div>
                <div className="text-xs text-muted-foreground">{units.powerRelUnit}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Target className="h-3 w-3" />
                  <span>RF Peak</span>
                </div>
                <div className="text-lg font-bold">{(analysis.rfPeak * 100).toFixed(0)}%</div>
                <Badge variant="outline" className={`text-xs mt-1 ${ratingColors[analysis.rfPeakRating]}`}>
                  {analysis.rfPeakRating}
                </Badge>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <TrendingDown className="h-3 w-3" />
                  <span>DRF</span>
                </div>
                <div className="text-lg font-bold">{analysis.drf.toFixed(3)}</div>
                <Badge variant="outline" className={`text-xs mt-1 ${ratingColors[analysis.drfRating]}`}>
                  {analysis.drfRating}
                </Badge>
              </div>
            </div>

            <div className="text-sm text-muted-foreground">
              Peak power occurs at {units.vel(analysis.velocityAtPmax).toFixed(1)} {units.velUnit} (V<sub>0</sub>/2)
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
