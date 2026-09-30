import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dumbbell, Zap, TrendingUp, Target, AlertTriangle } from 'lucide-react';
import type { SprintFvProfile } from '@/lib/sprint-fv-api';
import { useUnitSystem } from '@/contexts/UnitSystemContext';

interface Props {
  /** Only the fitted params + analysis are read, so slimmer report payloads are accepted too. */
  profile: Pick<SprintFvProfile, 'f0Rel' | 'v0' | 'analysisJson'>;
}

const classificationStyles = {
  'force-deficit': { color: 'bg-blue-100 text-blue-800', label: 'Force Deficit' },
  'velocity-deficit': { color: 'bg-amber-100 text-amber-800', label: 'Velocity Deficit' },
  'well-balanced': { color: 'bg-green-100 text-green-800', label: 'Well Balanced' },
};

const recIcons = [Dumbbell, Zap, TrendingUp, Target, AlertTriangle];

export function SprintFvAnalysisCard({ profile }: Props) {
  const analysis = profile.analysisJson;
  const units = useUnitSystem();
  if (!analysis) return null;

  const { classification, optimalGap } = analysis;
  const style = classificationStyles[classification.classification];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Analysis</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Section 1: Classification */}
          <div className="lg:col-span-2 space-y-3">
            <Badge className={`text-base px-3 py-1 ${style.color}`}>
              {style.label}
            </Badge>

            {/* Imbalance meter */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Force</span>
                <span>Balanced</span>
                <span>Velocity</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full relative">
                <div
                  className="absolute top-0 h-2 w-2 rounded-full bg-primary transform -translate-x-1/2"
                  style={{
                    left: `${classification.dominantQuality === 'force'
                      ? Math.max(5, 50 - classification.imbalancePercent / 2)
                      : classification.dominantQuality === 'velocity'
                      ? Math.min(95, 50 + classification.imbalancePercent / 2)
                      : 50}%`,
                  }}
                />
              </div>
            </div>

            <p className="text-sm text-muted-foreground">{classification.explanation}</p>
          </div>

          {/* Section 2: Training Recommendations */}
          <div className="lg:col-span-1 space-y-2">
            <h4 className="text-sm font-semibold">Training Focus</h4>
            <ul className="space-y-2">
              {classification.trainingRecommendations.slice(0, 4).map((rec, i) => {
                const Icon = recIcons[i % recIcons.length];
                return (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <span>{rec}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Section 3: Optimal Gap */}
          <div className="lg:col-span-2 space-y-3">
            <h4 className="text-sm font-semibold">Optimal Gap</h4>
            <div className="grid grid-cols-2 gap-3">
              <GapItem
                label="F0"
                actual={profile.f0Rel ? units.forceRel(parseFloat(profile.f0Rel)) : 0}
                optimal={units.forceRel(optimalGap.optimalF0)}
                gapPercent={optimalGap.f0GapPercent}
                unit={units.forceRelUnit}
              />
              <GapItem
                label="V0"
                actual={profile.v0 ? units.vel(parseFloat(profile.v0)) : 0}
                optimal={units.vel(optimalGap.optimalV0)}
                gapPercent={optimalGap.v0GapPercent}
                unit={units.velUnit}
              />
            </div>
            {optimalGap.estimatedTimeImprovement > 0.01 && (
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  {buildRecommendation(optimalGap, units)}
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function buildRecommendation(
  gap: NonNullable<SprintFvProfile['analysisJson']>['optimalGap'],
  units: ReturnType<typeof useUnitSystem>,
): string {
  // Fallback for profiles generated before sprintDistanceM was added
  if (!gap.sprintDistanceM) return gap.recommendation;
  const distLabel = units.system === 'imperial'
    ? `${(gap.sprintDistanceM * 1.09361).toFixed(0)}yd`
    : `${gap.sprintDistanceM.toFixed(0)}m`;
  const timeDelta = gap.estimatedTimeImprovement.toFixed(2);

  if (gap.f0Gap > 0 && gap.v0Gap < 0) {
    return `Increasing V0 by ${units.vel(Math.abs(gap.v0Gap)).toFixed(2)} ${units.velUnit} (while maintaining Pmax) ` +
      `could improve ${distLabel} time by ~${timeDelta}s.`;
  } else if (gap.f0Gap < 0 && gap.v0Gap > 0) {
    return `Increasing F0 by ${units.forceRel(Math.abs(gap.f0Gap)).toFixed(2)} ${units.forceRelUnit} (while maintaining Pmax) ` +
      `could improve ${distLabel} time by ~${timeDelta}s.`;
  }
  return `Profile is near optimal. Estimated time improvement from further balancing: ~${timeDelta}s.`;
}

function GapItem({ label, actual, optimal, gapPercent, unit }: {
  label: string;
  actual: number;
  optimal: number;
  gapPercent: number;
  unit: string;
}) {
  const isPositive = gapPercent >= 0;
  return (
    <div className="bg-gray-50 rounded-lg p-3 space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-bold">{actual.toFixed(2)}</span>
        <span className="text-xs text-muted-foreground">/ {optimal.toFixed(2)} {unit}</span>
      </div>
      <div className={`text-xs font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
        {isPositive ? '+' : ''}{gapPercent.toFixed(1)}%
      </div>
    </div>
  );
}
