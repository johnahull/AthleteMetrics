import { DEFAULT_CHART_SELECTION, type ChartSelection } from "@shared/report-charts";
import type { ReportTemplateCharts } from "@shared/report-template-schemas";

/** The template fields the wizard reads (a ReportTemplate row as JSON). */
export interface ReportTemplateData {
  id: string;
  name: string;
  description: string | null;
  metrics: string[];
  benchmarkSetIds: string[];
  siteBenchmarkIds: string[];
  customBenchmarkIds: string[];
  charts: ReportTemplateCharts;
}

type ReportType = "team" | "individual";
type Charts = Required<ChartSelection>;

export interface TemplateAvailability {
  enabledMetricCodes: Set<string>;
  availableSetIds: Set<string>;
  enabledBenchmarkIds: { site: Set<string>; custom: Set<string> };
}

const TEAM_CHART_KEYS = ["benchmarkStanding", "trends", "boxSwarm", "leaderboard", "tierDistribution"] as const;
const INDIVIDUAL_CHART_KEYS = ["radar", "benchmarkStanding", "trends", "distribution", "fvProfile"] as const;

/** Defaults with the template's saved choices for one report type on top. */
export function templateCharts(template: { charts: ReportTemplateCharts }, reportType: ReportType): Charts {
  return { ...(DEFAULT_CHART_SELECTION as Charts), ...template.charts[reportType] };
}

/** Wizard form values for a template; ids that are no longer available are dropped and counted. */
export function templateToFormValues(
  template: ReportTemplateData,
  reportType: ReportType,
  available: TemplateAvailability,
) {
  const keep = (ids: string[], ok: Set<string>) => ids.filter((id) => ok.has(id));
  const metrics = keep(template.metrics, available.enabledMetricCodes);
  const benchmarkSetIds = keep(template.benchmarkSetIds, available.availableSetIds);
  const siteBenchmarks = keep(template.siteBenchmarkIds, available.enabledBenchmarkIds.site);
  const customBenchmarks = keep(template.customBenchmarkIds, available.enabledBenchmarkIds.custom);
  const droppedCount =
    template.metrics.length - metrics.length +
    template.benchmarkSetIds.length - benchmarkSetIds.length +
    template.siteBenchmarkIds.length - siteBenchmarks.length +
    template.customBenchmarkIds.length - customBenchmarks.length;
  const charts = templateCharts(template, reportType);
  return { values: { metrics, benchmarkSetIds, siteBenchmarks, customBenchmarks, charts }, droppedCount };
}

/** Template payload from the wizard form: current-type charts replace that type's entry, the other type's is kept. */
export function formToTemplate(
  form: {
    metrics: string[];
    benchmarkSetIds: string[];
    siteBenchmarks?: string[];
    customBenchmarks?: string[];
    charts: Charts;
  },
  reportType: ReportType,
  loaded: { charts: ReportTemplateCharts } | undefined,
) {
  const pick = (keys: readonly string[]) =>
    Object.fromEntries(keys.map((k) => [k, form.charts[k as keyof Charts]]));
  return {
    metrics: form.metrics,
    benchmarkSetIds: form.benchmarkSetIds,
    siteBenchmarkIds: form.siteBenchmarks ?? [],
    customBenchmarkIds: form.customBenchmarks ?? [],
    charts: {
      ...loaded?.charts,
      ...(reportType === "team"
        ? { team: pick(TEAM_CHART_KEYS) }
        : { individual: pick(INDIVIDUAL_CHART_KEYS) }),
    } as ReportTemplateCharts,
  };
}
