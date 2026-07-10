// packages/web/src/components/reports/FvProfileSection.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format, parseISO } from 'date-fns';
import type { ReportFvProfile } from '@shared/report-fv-types';
import { ForceVelocityChart } from '@/components/charts/ForceVelocityChart';
import { SprintFvAnalysisCard } from '@/components/sprint-fv/SprintFvAnalysisCard';
import { UnitSystemProvider, useUnitSystem } from '@/contexts/UnitSystemContext';

interface FvProfileSectionProps {
  athleteName: string;
  fvProfile: ReportFvProfile;
}

/**
 * Individual-report section for the athlete's latest in-window sprint
 * Force-Velocity profile: compact KPI tiles + the F-V/P-V chart, followed by
 * the analysis narrative (classification, training focus, optimal gap).
 * Wraps itself in UnitSystemProvider because the reused sprint-fv components
 * require it and report views don't mount one.
 */
export function FvProfileSection({ athleteName, fvProfile }: FvProfileSectionProps) {
  return (
    <UnitSystemProvider>
      <Card data-testid="fv-profile-section">
        <CardHeader>
          <CardTitle>Sprint Force-Velocity Profile</CardTitle>
          <p className="text-sm text-muted-foreground">
            Session of {format(parseISO(fvProfile.date), 'MMM d, yyyy')} · {fvProfile.distanceUnit} split protocol
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <FvProfileBody athleteName={athleteName} fvProfile={fvProfile} />
        </CardContent>
      </Card>
    </UnitSystemProvider>
  );
}

/** Inner body so KPI tiles can call useUnitSystem under the provider above. */
function FvProfileBody({ athleteName, fvProfile }: FvProfileSectionProps) {
  const units = useUnitSystem();
  const hasFit = fvProfile.f0Rel != null && fvProfile.v0 != null;

  const fmt = (raw: string | null, digits: number, convert?: (n: number) => number): string => {
    if (raw == null) return '—';
    const n = parseFloat(raw);
    if (Number.isNaN(n)) return '—';
    return (convert ? convert(n) : n).toFixed(digits);
  };

  const kpis: Array<{ label: string; value: string; unit?: string }> = [
    { label: 'F0', value: fmt(fvProfile.f0Rel, 2, units.forceRel), unit: units.forceRelUnit },
    { label: 'V0', value: fmt(fvProfile.v0, 2, units.vel), unit: units.velUnit },
    { label: 'Pmax', value: fmt(fvProfile.pmaxRel, 2), unit: units.powerRelUnit },
    { label: 'F-V Slope', value: fmt(fvProfile.fvSlope, 3) },
    { label: 'Fit R²', value: fmt(fvProfile.fitR2, 3) },
  ];

  return (
    <>
      <div
        data-report-chart="fvProfile"
        data-report-chart-title={`${athleteName} — Force-Velocity profile`}
      >
        {/* Plain-language lead-in (HTML, not canvas) so it reads on screen and in the PDF. */}
        <p className="mb-3 text-sm text-muted-foreground">
          Theoretical maximal force (F0), top-end velocity (V0), and peak relative power (Pmax)
          fitted from {athleteName}&apos;s sprint splits.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="bg-muted/50 rounded-lg p-3 text-center">
              <div className="text-xs text-muted-foreground">{kpi.label}</div>
              <div className="text-lg font-bold">{kpi.value}</div>
              {kpi.unit && <div className="text-xs text-muted-foreground">{kpi.unit}</div>}
            </div>
          ))}
        </div>
        {hasFit && (
          <div
            className="w-full h-[320px]"
            role="img"
            aria-label={`Force-velocity and power-velocity curves for ${athleteName}.`}
          >
            <ForceVelocityChart profile={fvProfile} />
          </div>
        )}
      </div>

      {fvProfile.analysisJson && (
        <div
          data-report-chart="fvProfile:analysis"
          data-report-chart-title={`${athleteName} — F-V analysis`}
        >
          <SprintFvAnalysisCard profile={fvProfile} />
        </div>
      )}
    </>
  );
}

export default FvProfileSection;
