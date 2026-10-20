import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { toCalendarDate } from '@/utils/date-utils';
import {
  groupSprintRuns,
  type SprintRun,
  type SprintRunMeasurement,
  type SprintUnit,
} from '@/utils/sprint-runs';

interface SprintRunsCardProps {
  measurements: SprintRunMeasurement[];
  className?: string;
}

const UNIT_SUFFIX: Record<SprintUnit, string> = { YD: 'yd', M: 'm' };

const formatDate = (date: string) =>
  toCalendarDate(date)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) ?? date;

const intervalKey = (from: number, to: number) => `${from}-${to}`;

const round2 = (n: number) => Math.round(n * 100) / 100;

const finalTime = (run: SprintRun) => run.gates.find(g => g.distance === run.finalDistance)?.time;

/** Runs that hold the fastest Final Time for their distance, when that distance has two or more runs */
function personalBestKeys(runs: SprintRun[]): Set<string> {
  const byDistance = new Map<number, SprintRun[]>();
  for (const run of runs) {
    if (!run.hasFinal) continue;
    byDistance.set(run.finalDistance, [...(byDistance.get(run.finalDistance) ?? []), run]);
  }
  const keys = new Set<string>();
  for (const group of byDistance.values()) {
    if (group.length < 2) continue;
    // Runs are newest first: on a tie the older run (later in the array) keeps the PR
    const best = group.reduce((a, b) => ((finalTime(b) ?? Infinity) <= (finalTime(a) ?? Infinity) ? b : a));
    keys.add(best.key);
  }
  return keys;
}

export function SprintRunsCard({ measurements, className }: SprintRunsCardProps) {
  const runsByUnit = useMemo(
    () => ({ YD: groupSprintRuns(measurements, 'YD'), M: groupSprintRuns(measurements, 'M') }),
    [measurements],
  );
  const [picked, setPicked] = useState<SprintUnit | null>(null);

  const hasBoth = runsByUnit.YD.length > 0 && runsByUnit.M.length > 0;
  const newestM = runsByUnit.M[0]?.date;
  const newestYd = runsByUnit.YD[0]?.date;
  const defaultUnit: SprintUnit = newestM !== undefined && (newestYd === undefined || newestM > newestYd) ? 'M' : 'YD';
  const unit: SprintUnit = picked && runsByUnit[picked].length > 0 ? picked : defaultUnit;
  const runs = runsByUnit[unit];
  const suffix = UNIT_SUFFIX[unit];

  const { distances, intervals } = useMemo(() => {
    const dist = new Set<number>();
    const ivs = new Map<string, { from: number; to: number; runInYd?: number }>();
    for (const run of runs) {
      run.gates.forEach(g => dist.add(g.distance));
      run.intervals.forEach(i => ivs.set(intervalKey(i.from, i.to), { from: i.from, to: i.to, runInYd: i.runInYd }));
    }
    return {
      distances: [...dist].sort((a, b) => a - b),
      intervals: [...ivs.values()].sort((a, b) => a.from - b.from || a.to - b.to),
    };
  }, [runs]);

  const prKeys = useMemo(() => personalBestKeys(runs), [runs]);

  if (runsByUnit.YD.length === 0 && runsByUnit.M.length === 0) return null;

  // Seconds faster than the same interval in the next-older run (an earlier date) that has it, as displayed (2 dp)
  const fasterBy = (index: number, from: number, to: number): number | null => {
    const current = runs[index].intervals.find(i => i.from === from && i.to === to);
    if (!current) return null;
    for (let j = index + 1; j < runs.length; j++) {
      if (runs[j].date >= runs[index].date) continue;
      const older = runs[j].intervals.find(i => i.from === from && i.to === to);
      if (older) {
        const gain = round2(older.time) - round2(current.time);
        return gain > 0 ? gain : null;
      }
    }
    return null;
  };

  return (
    <Card className={className ? `bg-white ${className}` : "bg-white"}>
      <CardHeader className="flex flex-row items-center justify-between">
        <h2 id="sprint-runs-heading" className="text-xl font-semibold text-gray-900">Sprint runs</h2>
        {hasBoth && (
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={unit}
            onValueChange={(v) => v && setPicked(v as SprintUnit)}
            aria-label="Distance unit"
          >
            <ToggleGroupItem value="YD">Yards</ToggleGroupItem>
            <ToggleGroupItem value="M">Meters</ToggleGroupItem>
          </ToggleGroup>
        )}
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-600 mb-3">
          Cumulative gate times, then the time between gates. Green with a ▼ means faster than the same interval in the previous run.
        </p>
        <Table aria-labelledby="sprint-runs-heading">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Date</TableHead>
              {distances.map(d => (
                <TableHead key={`g${d}`} scope="col" className="text-right">{`${d} ${suffix}`}</TableHead>
              ))}
              {intervals.map(i => (
                <TableHead key={`i${i.from}-${i.to}`} scope="col" className="text-right">
                  {`${i.from}–${i.to} ${suffix}`}
                  {i.runInYd !== undefined && (
                    <abbr title={`${i.runInYd} yd run-in`} className="font-normal no-underline">{` (RI${i.runInYd})`}</abbr>
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run, index) => (
              <TableRow key={run.key}>
                <TableHead scope="row" className="whitespace-nowrap font-normal text-foreground">
                  {formatDate(run.date)}
                  {prKeys.has(run.key) && <Badge className="ml-2 bg-green-700 text-white">PR</Badge>}
                  {run.pooled && <div className="text-xs text-gray-600">mixed attempts</div>}
                </TableHead>
                {distances.map(d => {
                  const gate = run.gates.find(g => g.distance === d);
                  return (
                    <TableCell key={`g${d}`} className="text-right tabular-nums">
                      {gate ? gate.time.toFixed(2) : '—'}
                    </TableCell>
                  );
                })}
                {intervals.map(i => {
                  const cell = run.intervals.find(x => x.from === i.from && x.to === i.to);
                  const gain = cell ? fasterBy(index, i.from, i.to) : null;
                  return (
                    <TableCell
                      key={`i${i.from}-${i.to}`}
                      className={`text-right tabular-nums ${gain !== null ? 'text-green-700 font-medium' : ''}`}
                      data-faster={gain !== null ? 'true' : undefined}
                    >
                      {cell ? cell.time.toFixed(2) : '—'}
                      {gain !== null && <span aria-hidden="true" className="ml-1 text-xs">▼</span>}
                      {gain !== null && <span className="sr-only">{`, ${gain.toFixed(2)} seconds faster than previous run`}</span>}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
