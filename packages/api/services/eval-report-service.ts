/**
 * Eval Report Service
 * Assembles data for the BTA Eval Report One-Pager PDF.
 * Fetches athlete measurements, D1 benchmark tiers, and computes
 * gauge positions + pathway recommendations.
 */

import { db } from '../db';
import {
  users,
  measurements,
  siteBenchmarks,
  siteMetrics,
  userTeams,
  teams,
} from '@shared/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';

// ---------- Types ----------

export interface EvalMetricData {
  metricCode: string;
  label: string;
  unit: string;
  category: 'speed' | 'power' | 'agility';
  lowerIsBetter: boolean;
  athleteValue: number;
  hsAverage: number | null;
  d1Average: number | null;
  d1Elite: number | null;
  /** 0 = HS Avg, 100 = D1 Elite. Can be <0 or >100. */
  gaugePosition: number | null;
}

export interface EvalReportData {
  athleteId: string;
  athleteName: string;
  sport: string;
  gender: string | null;
  graduationYear: number | null;
  teamName: string | null;
  evaluationDate: string;
  metrics: EvalMetricData[];
  pathway: 'Foundation' | 'Performance' | 'Elite';
  strengths: string[];
  developmentAreas: string[];
  trainingFocus: string[];
}

// Metric code → category mapping
const METRIC_CATEGORIES: Record<string, 'speed' | 'power' | 'agility'> = {
  DASH_10YD: 'speed',
  FLY10_TIME: 'speed',
  DASH_40YD: 'speed',
  TOP_SPEED: 'speed',
  VERTICAL_JUMP: 'power',
  RSI: 'power',
  AGILITY_5105: 'agility',
  AGILITY_505: 'agility',
  T_TEST: 'agility',
};

// Tier name mapping used in the D1 benchmark seed data
const TIER_HS_AVG = 'HS Average';
const TIER_D1_AVG = 'D1 Average';
const TIER_D1_ELITE = 'D1 Elite';

// ---------- Service ----------

export async function assembleEvalReportData(
  athleteId: string,
  organizationId: string,
  sportOverride?: string,
): Promise<EvalReportData> {
  // 1. Fetch athlete
  const [athlete] = await db
    .select()
    .from(users)
    .where(eq(users.id, athleteId));

  if (!athlete) throw new Error('Athlete not found');

  const sport = sportOverride ?? (athlete.sports as string[] | null)?.[0] ?? 'SOCCER';
  const gender = (athlete.gender as string | null) ?? 'Female';

  // 2. Fetch athlete's team name (first active team)
  const athleteTeams = await db
    .select({ teamName: teams.name })
    .from(userTeams)
    .innerJoin(teams, eq(teams.id, userTeams.teamId))
    .where(and(eq(userTeams.userId, athleteId), eq(userTeams.isActive, true)))
    .limit(1);
  const teamName = athleteTeams[0]?.teamName ?? null;

  // 3. Fetch latest measurements for each metric
  const allMeasurements = await db
    .select()
    .from(measurements)
    .where(
      and(
        eq(measurements.userId, athleteId),
        eq(measurements.organizationId, organizationId),
      ),
    )
    .orderBy(desc(measurements.date));

  // Keep best value per metric
  const bestByMetric = new Map<string, number>();
  const metricInfoNeeded = new Set<string>();

  for (const m of allMeasurements) {
    metricInfoNeeded.add(m.metric);
    const val = parseFloat(m.value);
    if (isNaN(val)) continue;
    if (!bestByMetric.has(m.metric)) {
      bestByMetric.set(m.metric, val);
    }
  }

  // 4. Fetch metric info (label, unit, metricType) for all measured metrics
  const metricCodes = Array.from(metricInfoNeeded);
  const metricInfoRows = metricCodes.length > 0
    ? await db
        .select({
          code: siteMetrics.code,
          label: siteMetrics.label,
          unit: siteMetrics.unit,
          metricType: siteMetrics.metricType,
        })
        .from(siteMetrics)
        .where(inArray(siteMetrics.code, metricCodes))
    : [];

  const metricInfoMap = new Map(metricInfoRows.map(r => [r.code, r]));

  // We need lowerIsBetter to pick best value correctly — re-scan
  for (const m of allMeasurements) {
    const val = parseFloat(m.value);
    if (isNaN(val)) continue;
    const info = metricInfoMap.get(m.metric);
    const lowerIsBetter = info?.metricType === 'lower_is_better';
    const cur = bestByMetric.get(m.metric);
    if (cur !== undefined) {
      if (lowerIsBetter ? val < cur : val > cur) {
        bestByMetric.set(m.metric, val);
      }
    }
  }

  // 5. Fetch D1 benchmarks for this sport + gender
  const benchmarkRows = await db
    .select({
      metricCode: siteBenchmarks.metricCode,
      tierName: siteBenchmarks.tierName,
      benchmarkValue: siteBenchmarks.benchmarkValue,
    })
    .from(siteBenchmarks)
    .where(
      and(
        eq(siteBenchmarks.isActive, true),
        eq(siteBenchmarks.sport, sport),
        eq(siteBenchmarks.gender, gender),
      ),
    );

  // Organize benchmarks: metricCode → { tierName → value }
  const benchmarkMap = new Map<string, Map<string, number>>();
  for (const row of benchmarkRows) {
    if (!row.benchmarkValue || !row.tierName) continue;
    if (!benchmarkMap.has(row.metricCode)) {
      benchmarkMap.set(row.metricCode, new Map());
    }
    benchmarkMap.get(row.metricCode)!.set(row.tierName, parseFloat(row.benchmarkValue));
  }

  // 6. Build metric data array
  const evalMetrics: EvalMetricData[] = [];
  for (const [metricCode, athleteValue] of bestByMetric) {
    const info = metricInfoMap.get(metricCode);
    if (!info) continue;
    const category = METRIC_CATEGORIES[metricCode];
    if (!category) continue; // skip metrics not in the eval categories

    const tiers = benchmarkMap.get(metricCode);
    const hsAvg = tiers?.get(TIER_HS_AVG) ?? null;
    const d1Avg = tiers?.get(TIER_D1_AVG) ?? null;
    const d1Elite = tiers?.get(TIER_D1_ELITE) ?? null;
    const lowerIsBetter = info.metricType === 'lower_is_better';

    const gaugePosition = computeGaugePosition(athleteValue, hsAvg, d1Elite, lowerIsBetter);

    evalMetrics.push({
      metricCode,
      label: info.label ?? metricCode,
      unit: info.unit ?? '',
      category,
      lowerIsBetter,
      athleteValue,
      hsAverage: hsAvg,
      d1Average: d1Avg,
      d1Elite,
      gaugePosition,
    });
  }

  // Sort: speed → power → agility
  const categoryOrder = { speed: 0, power: 1, agility: 2 };
  evalMetrics.sort((a, b) => categoryOrder[a.category] - categoryOrder[b.category]);

  // Limit to 6 metrics max (to fit on one page)
  const metrics = evalMetrics.slice(0, 6);

  // 7. Compute pathway + recommendations
  const meetsD1Count = metrics.filter(m => {
    if (m.d1Average === null) return false;
    return m.lowerIsBetter
      ? m.athleteValue <= m.d1Average
      : m.athleteValue >= m.d1Average;
  }).length;

  const totalWithBenchmarks = metrics.filter(m => m.d1Average !== null).length;
  const meetRatio = totalWithBenchmarks > 0 ? meetsD1Count / totalWithBenchmarks : 0;

  let pathway: 'Foundation' | 'Performance' | 'Elite';
  if (meetRatio >= 0.75) pathway = 'Elite';
  else if (meetRatio >= 0.4) pathway = 'Performance';
  else pathway = 'Foundation';

  // Strengths: metrics closest to or exceeding D1 Elite (highest gauge position)
  const withGauge = metrics.filter(m => m.gaugePosition !== null);
  const sortedByStrength = [...withGauge].sort((a, b) => b.gaugePosition! - a.gaugePosition!);
  const strengths = sortedByStrength.slice(0, 2).map(m => `${m.label}: ${formatValue(m.athleteValue, m.unit)}`);

  // Development areas: furthest below D1 Average (lowest gauge position)
  const sortedByWeakness = [...withGauge].sort((a, b) => a.gaugePosition! - b.gaugePosition!);
  const developmentAreas = sortedByWeakness.slice(0, 2).map(m => `${m.label}: ${formatValue(m.athleteValue, m.unit)}`);

  // Training focus based on weakest categories
  const weakCategories = sortedByWeakness.slice(0, 3).map(m => m.category);
  const uniqueWeakCategories = [...new Set(weakCategories)];
  const focusMap: Record<string, string> = {
    speed: 'Sprint mechanics & acceleration drills',
    power: 'Plyometrics & explosive strength training',
    agility: 'Change-of-direction & reactive agility work',
  };
  const trainingFocus = uniqueWeakCategories.map(c => focusMap[c]);

  return {
    athleteId,
    athleteName: athlete.fullName ?? `${athlete.firstName} ${athlete.lastName}`,
    sport,
    gender,
    graduationYear: athlete.graduationYear,
    teamName,
    evaluationDate: new Date().toISOString().split('T')[0],
    metrics,
    pathway,
    strengths,
    developmentAreas,
    trainingFocus,
  };
}

// ---------- Helpers ----------

function computeGaugePosition(
  athleteValue: number,
  hsAvg: number | null,
  d1Elite: number | null,
  lowerIsBetter: boolean,
): number | null {
  if (hsAvg === null || d1Elite === null) return null;

  // Normalize direction: in "gauge space", higher = better
  let normAthlete = athleteValue;
  let normHS = hsAvg;
  let normElite = d1Elite;

  if (lowerIsBetter) {
    // Flip: lower time → higher gauge
    normAthlete = -athleteValue;
    normHS = -hsAvg;
    normElite = -d1Elite;
  }

  const range = normElite - normHS;
  if (range === 0) return 50;

  return ((normAthlete - normHS) / range) * 100;
}

function formatValue(value: number, unit: string): string {
  if (unit === 's') return `${value.toFixed(2)}s`;
  if (unit === 'in') return `${value.toFixed(1)}"`;
  if (unit === 'mph') return `${value.toFixed(1)} mph`;
  return `${value.toFixed(2)}${unit ? ` ${unit}` : ''}`;
}
