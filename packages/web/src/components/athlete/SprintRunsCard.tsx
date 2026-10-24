import { Fragment, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { toCalendarDate } from '@/utils/date-utils';
import {
  describeInterval,
  filterRunsByRange,
  groupSprintRuns,
  localDateString,
  summarizeSprintRuns,
  type SprintRange,
  type SprintRun,
  type SprintRunMeasurement,
  type SprintUnit,
} from '@/utils/sprint-runs';

interface SprintRunsCardProps {
  measurements: SprintRunMeasurement[];
  className?: string;
}

const UNIT_SUFFIX: Record<SprintUnit, string> = { YD: 'yd', M: 'm' };

const RANGE_LABEL: Record<SprintRange, string> = { '6m': 'Last 6 months', '12m': 'Last 12 months', all: 'All time' };

const formatDate = (date: string) =>
  toCalendarDate(date)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) ?? date;

const intervalKey = (from: number, to: number) => `${from}-${to}`;

const round2 = (n: number) => Math.round(n * 100) / 100;

const minus = (seconds: number) => `−${Math.abs(seconds).toFixed(2)} s`;

function SummaryStat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div role="group" aria-label={label} className="rounded-lg border bg-gray-50 p-3">
      <div className="text-sm text-gray-600">{label}</div>
      <div className="text-2xl font-bold text-gray-900 tabular-nums">{value}</div>
      {note && <div className="text-sm text-gray-600">{note}</div>}
    </div>
  );
}

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
  const [range, setRange] = useState<SprintRange>('12m');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const hasBoth = runsByUnit.YD.length > 0 && runsByUnit.M.length > 0;
  const newestM = runsByUnit.M[0]?.date;
  const newestYd = runsByUnit.YD[0]?.date;
  const defaultUnit: SprintUnit = newestM !== undefined && (newestYd === undefined || newestM > newestYd) ? 'M' : 'YD';
  const unit: SprintUnit = picked && runsByUnit[picked].length > 0 ? picked : defaultUnit;
  // PR and the faster marker use every run; the range only limits what is shown
  const allRuns = runsByUnit[unit];
  const runs = useMemo(() => filterRunsByRange(allRuns, range, localDateString()), [allRuns, range]);
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

  const prKeys = useMemo(() => personalBestKeys(allRuns), [allRuns]);
  const summary = useMemo(() => summarizeSprintRuns(runs), [runs]);
  const indexByKey = useMemo(() => new Map(allRuns.map((r, i) => [r.key, i])), [allRuns]);

  if (runsByUnit.YD.length === 0 && runsByUnit.M.length === 0) return null;

  // Seconds faster than the same interval in the next-older run (an earlier date) that has it, as displayed (2 dp)
  const fasterBy = (run: SprintRun, from: number, to: number): number | null => {
    const index = indexByKey.get(run.key) ?? -1;
    const current = run.intervals.find(i => i.from === from && i.to === to);
    if (!current) return null;
    for (let j = index + 1; j < allRuns.length; j++) {
      if (allRuns[j].date >= run.date) continue;
      const older = allRuns[j].intervals.find(i => i.from === from && i.to === to);
      if (older) {
        const gain = round2(older.time) - round2(current.time);
        return gain > 0 ? gain : null;
      }
    }
    return null;
  };

  return (
    <Card className={cn("bg-white", className)}>
      <CardHeader className="flex flex-row items-center justify-between">
        <h2 id="sprint-runs-heading" className="text-xl font-semibold text-gray-900">Sprint runs</h2>
        <div className="flex flex-wrap items-center gap-2">
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
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={range}
            onValueChange={(v) => v && setRange(v as SprintRange)}
            aria-label="Time range"
          >
            {(Object.keys(RANGE_LABEL) as SprintRange[]).map(r => (
              <ToggleGroupItem key={r} value={r}>{RANGE_LABEL[r]}</ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </CardHeader>
      <CardContent>
        {runs.length === 0 ? (
          <div className="flex flex-col items-start gap-2 py-2">
            <p className="text-gray-700">{`No runs in the ${RANGE_LABEL[range].toLowerCase()}`}</p>
            <Button variant="outline" size="sm" onClick={() => setRange('all')}>Show all time</Button>
          </div>
        ) : (
          <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {summary.bestFinal && (
            <SummaryStat
              label={`Best ${summary.bestFinal.distance} ${suffix}`}
              value={`${summary.bestFinal.time.toFixed(2)} s`}
              note={summary.bestFinal.delta !== null ? `${minus(summary.bestFinal.delta)} since ${formatDate(summary.bestFinal.sinceDate)}` : undefined}
            />
          )}
          {summary.bestFly && (
            <SummaryStat
              label={`Best fly 10 (RI${summary.bestFly.runInYd})`}
              value={`${summary.bestFly.time.toFixed(2)} s`}
              note={summary.bestFly.delta !== null ? `${minus(summary.bestFly.delta)} since ${formatDate(summary.bestFly.sinceDate)}` : undefined}
            />
          )}
          {summary.biggestGain && (
            <SummaryStat
              label="Biggest gain"
              value={`${summary.biggestGain.from}–${summary.biggestGain.to} ${suffix}`}
              note={minus(summary.biggestGain.gain)}
            />
          )}
          <SummaryStat
            label="Runs recorded"
            value={String(summary.runCount)}
            note={
              summary.firstDate && summary.lastDate && summary.firstDate !== summary.lastDate
                ? `${formatDate(summary.firstDate)} – ${formatDate(summary.lastDate)}`
                : summary.firstDate
                  ? formatDate(summary.firstDate)
                  : undefined
            }
          />
        </div>
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
            {runs.map((run) => {
              const open = expanded.has(run.key);
              const detailId = `sprint-run-detail-${run.key}`;
              return (
              <Fragment key={run.key}>
              <TableRow>
                <TableHead scope="row" className="whitespace-nowrap font-normal text-foreground">
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={open ? detailId : undefined}
                    onClick={() =>
                      setExpanded(prev => {
                        const next = new Set(prev);
                        if (!next.delete(run.key)) next.add(run.key);
                        return next;
                      })
                    }
                    className="rounded px-1 -mx-1 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {formatDate(run.date)}
                  </button>
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
                  const gain = cell ? fasterBy(run, i.from, i.to) : null;
                  return (
                    <TableCell
                      key={`i${i.from}-${i.to}`}
                      className={cn('text-right tabular-nums', gain !== null && 'text-green-700 font-medium')}
                      data-faster={gain !== null ? 'true' : undefined}
                    >
                      {cell ? cell.time.toFixed(2) : '—'}
                      {gain !== null && <span aria-hidden="true" className="ml-1 text-xs">▼</span>}
                      {gain !== null && <span className="sr-only">{`, ${gain.toFixed(2)} seconds faster than previous run`}</span>}
                    </TableCell>
                  );
                })}
              </TableRow>
              {open && (
                <TableRow id={detailId}>
                  <TableCell colSpan={1 + distances.length + intervals.length} className="bg-gray-50">
                    <div className="flex flex-col gap-1 text-sm text-gray-800">
                      <div>
                        {`Gates: ${run.gates.map(g => `${g.distance} ${suffix} ${g.time.toFixed(3)} s`).join(' · ')}`}
                      </div>
                      {run.intervals.map(i => (
                        <div key={`${i.from}-${i.to}`} className="tabular-nums">{describeInterval(run, i)}</div>
                      ))}
                      {run.pooled && <div>Mixed attempts: fastest time per distance across the day</div>}
                      {!run.pooled && !run.hasFinal && <div>Partial run: no final time recorded</div>}
                    </div>
                  </TableCell>
                </TableRow>
              )}
              </Fragment>
              );
            })}
          </TableBody>
        </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
