import { useRoute, useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Calendar, Weight, Ruler } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSprintFvProfile } from '@/lib/sprint-fv-api';
import { SprintFvKpiCards } from '@/components/sprint-fv/SprintFvKpiCards';
import { SprintFvAnalysisCard } from '@/components/sprint-fv/SprintFvAnalysisCard';
import { SprintFvAccelerationCard } from '@/components/sprint-fv/SprintFvAccelerationCard';
import { SprintFvPowerCard } from '@/components/sprint-fv/SprintFvPowerCard';
import { ForceVelocityChart } from '@/components/charts/ForceVelocityChart';
import { VelocityTimeCurve } from '@/components/charts/VelocityTimeCurve';
import { UnitSystemProvider, useUnitSystem } from '@/contexts/UnitSystemContext';
import { UnitSystemToggle } from '@/components/sprint-fv/UnitSystemToggle';

export default function SprintFvProfileDetailPage() {
  return (
    <UnitSystemProvider>
      <SprintFvProfileDetailInner />
    </UnitSystemProvider>
  );
}

function SprintFvProfileDetailInner() {
  const [, params] = useRoute('/sprint-fv/:id');
  const [, navigate] = useLocation();
  const { data: profile, isLoading, error } = useSprintFvProfile(params?.id);
  const units = useUnitSystem();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="container mx-auto p-6">
        <p className="text-red-600">Failed to load profile: {error?.message || 'Not found'}</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/sprint-fv')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Back button + unit toggle */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/sprint-fv')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Sprint F-V
        </Button>
        <UnitSystemToggle />
      </div>

      {/* 1. Header card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{profile.date}</span>
            </div>
            <div className="flex items-center gap-2">
              <Weight className="h-4 w-4 text-muted-foreground" />
              <span>{units.mass(parseFloat(profile.bodyMassKg)).toFixed(1)} {units.massUnit}</span>
            </div>
            <div className="flex items-center gap-2">
              <Ruler className="h-4 w-4 text-muted-foreground" />
              <Badge variant="outline">{profile.distanceUnit}</Badge>
            </div>
            {profile.teamNameSnapshot && (
              <Badge variant="secondary">{profile.teamNameSnapshot}</Badge>
            )}
            {profile.notes && (
              <span className="text-sm text-muted-foreground">{profile.notes}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Parameter plausibility warnings */}
      {profile.analysisJson?.parameterWarnings && profile.analysisJson.parameterWarnings.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="font-medium text-blue-800 mb-1">Parameter Warnings</p>
          <ul className="list-disc list-inside text-sm text-blue-700">
            {profile.analysisJson.parameterWarnings.map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 2. KPI cards */}
      <SprintFvKpiCards profile={profile} />

      {/* Alerts from delta analysis */}
      {profile.analysisJson?.deltas?.alerts && profile.analysisJson.deltas.alerts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="font-medium text-amber-800 mb-1">Alerts</p>
          <ul className="list-disc list-inside text-sm text-amber-700">
            {profile.analysisJson.deltas.alerts.map((alert, i) => (
              <li key={i}>{alert}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 3. Analysis card */}
      <SprintFvAnalysisCard profile={profile} />

      {/* 4. Hero chart — Force-Velocity + Power Analysis */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Force-Velocity Profile</h2>
        <ForceVelocityChart profile={profile} />
      </div>

      <SprintFvPowerCard profile={profile} />

      {/* 5. Secondary chart — Velocity-Time + Acceleration Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-semibold mb-3">Velocity-Time Curve</h2>
          <VelocityTimeCurve profile={profile} />
        </div>

        {/* 6. Split times table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Split Times</CardTitle>
          </CardHeader>
          <CardContent>
            {profile.fitResiduals && profile.fitResiduals.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Distance ({profile.distanceUnit === 'yards' ? 'yd' : 'm'})</TableHead>
                    <TableHead className="text-right">Observed (s)</TableHead>
                    <TableHead className="text-right">Predicted (s)</TableHead>
                    <TableHead className="text-right">Residual (s)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profile.fitResiduals.map((r) => (
                    <TableRow key={r.distance}>
                      <TableCell>{r.distance}</TableCell>
                      <TableCell className="text-right">{r.observedTime.toFixed(3)}</TableCell>
                      <TableCell className="text-right">{r.predictedTime.toFixed(3)}</TableCell>
                      <TableCell className={`text-right ${Math.abs(r.residual) > 0.05 ? 'text-amber-600' : ''}`}>
                        {r.residual >= 0 ? '+' : ''}{r.residual.toFixed(3)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground">No residual data available.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <SprintFvAccelerationCard profile={profile} />
    </div>
  );
}
