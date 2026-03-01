/**
 * Training Consistency Overview Page (Coach / Org Admin)
 * Route: /training/compliance
 *
 * UI uses "Consistency" language (not "Compliance") per athlete-facing copy conventions.
 * Full consistency table, sortable, per-athlete last session.
 */

import { useLocation } from "wouter";
import { useEffect } from "react";
import { Dumbbell, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useTrainingAccess } from "@/hooks/use-training-access";
import { useTrainingCompliance } from "@/hooks/useTrainingCompliance";
import { TrainingComplianceTable } from "@/components/training/TrainingComplianceTable";

export default function TrainingCompliancePage() {
  const { isEnabled, isLoading, organizationId } = useTrainingAccess();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && !isEnabled) {
      navigate("/");
    }
  }, [isEnabled, isLoading, navigate]);

  const { data: complianceRows = [], isLoading: complianceLoading } = useTrainingCompliance(organizationId);

  if (isLoading || !isEnabled) return null;

  const avgConsistency =
    complianceRows.length > 0
      ? Math.round(complianceRows.reduce((sum, r) => sum + r.consistencyPercent, 0) / complianceRows.length)
      : null;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Dumbbell className="h-7 w-7 text-primary" />
        <h1 className="text-3xl font-bold">Consistency Overview</h1>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-200">
          Experimental
        </span>
      </div>

      {/* Summary stats */}
      {!complianceLoading && complianceRows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold">{complianceRows.length}</p>
              <p className="text-sm text-muted-foreground">Athletes with active programs</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold text-primary">{avgConsistency}%</p>
              <p className="text-sm text-muted-foreground">Average consistency</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold text-green-600">
                {complianceRows.filter((r) => r.consistencyPercent >= 80).length}
              </p>
              <p className="text-sm text-muted-foreground">Athletes at 80%+ consistency</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Team Consistency
          </CardTitle>
          <CardDescription>
            Track how consistently athletes are completing their training programs.
            Click an athlete's name to view their full schedule.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TrainingComplianceTable
            rows={complianceRows}
            isLoading={complianceLoading}
          />
        </CardContent>
      </Card>
    </div>
  );
}
