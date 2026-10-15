/**
 * Eval report PDF renderer (AM-FEAT-019 P3b).
 *
 * Draws ONLY the frozen EvalReportModel saved in reports.config.model (or a snapshot of it): no database
 * reads, so a report always shows what was generated. Sections are measured, then flowed down the pages in
 * one loop that tracks y. A gauge row is never split by a page break; the headline and trend sections may
 * break BETWEEN rows (title repeated as "(continued)"), other sections move whole to the next page.
 * The gauge and header drawing is adapted from the unmerged feature/eval-report-onepager (244c53f8); its
 * data layer is not.
 *
 * Fonts: jsPDF's built-in Helvetica only covers WinAnsi (Latin-1 plus a few symbols). Text outside it would
 * print as garbage, so display text goes through `winAnsi`: common typographic punctuation is mapped to
 * ASCII and any other character becomes "?". A name in another script therefore shows as "?" marks until an
 * embedded Unicode font is added.
 */
import { jsPDF } from "jspdf";
import { fetchLogoBase64, hexToRgb, type LogoFetchResult } from "../routes/report-branding-utils";
import {
  FRESH_AND_HEALTHY_LABELS,
  LOAD_LABELS,
  METRIC_LABELS,
  PDF_COPY,
  SECTION_TITLES,
  formatValue,
} from "../services/eval-report/copy";
import type { EvalMetricResult, EvalReportModel } from "../services/eval-report/model";

type Rgb = [number, number, number];

/** The organization fields used for branding (a subset of the organizations row). */
export interface EvalPdfOrg {
  name?: string | null;
  brandLogoUrl?: string | null;
  brandPrimaryColor?: string | null;
  brandSecondaryColor?: string | null;
  brandTagline?: string | null;
}

/** Where a block, gauge row or gauge mark was drawn, in mm on its page (x only for marks). */
export interface EvalPdfBlock {
  kind: string;
  page: number;
  top: number;
  bottom: number;
  x?: number;
}

const PAGE_W = 210;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;
/** Continuation pages start here; nothing is drawn below the bottom limit except the footer. */
export const EVAL_PDF_TOP_LIMIT = 18;
export const EVAL_PDF_BOTTOM_LIMIT = 278;
const FOOTER_Y = 288;
const HEADER_H = 40;
const SECTION_GAP = 6;
const TITLE_H = 10;
/** A section breaks between rows only when this many rows (or this much height) fit on the current page. */
const MIN_ROWS_BEFORE_BREAK = 3;
const MIN_BODY_BEFORE_BREAK = 60;
const SPLITTABLE: ReadonlySet<string> = new Set(["headline", "retestTrend"]);

const TEXT: Rgb = [40, 40, 40];
const MUTED: Rgb = [110, 110, 110];
const LIGHT: Rgb = [229, 231, 235];
const WHITE: Rgb = [255, 255, 255];
const DEFAULT_PRIMARY: Rgb = [30, 58, 95];

// Gauge geometry: label and value on the left, the bar on the right
const GAUGE_X = 92;
const GAUGE_W = CONTENT_W + MARGIN - GAUGE_X;
const BAR_H = 4;
/** A distance from the average beyond this many percent sits at the end of the bar. */
const GAUGE_RANGE_PCT = 25;
const ROW_H = 20;
const ROW_H_COLLEGE = 24.5;
const ROW_H_PLAIN = 16;
const LINE_H = 5;
const MIN_RADAR_AXES = 3;
const MAX_RADAR_AXES = 12;
const MIN_HEADER_CONTRAST = 3;

type Rec = (kind: string, top: number, bottom: number, x?: number) => void;

interface Row {
  height: number;
  draw: (doc: jsPDF, y: number, record: Rec) => void;
}

interface Section {
  kind: string;
  title: string;
  rows: Row[];
  /** Tinted panel behind the section (the prominent "What we saw" note) */
  panel?: boolean;
}

const TYPOGRAPHY: [RegExp, string][] = [
  [/[‘’‚]/g, "'"],
  [/[“”„]/g, '"'],
  [/[–—]/g, "-"],
  [/…/g, "..."],
  [/\t/g, " "],
];

/** Display text limited to what the built-in font can draw (see the file header). */
export function winAnsi(text: string): string {
  let out = text;
  for (const [re, to] of TYPOGRAPHY) out = out.replace(re, to);
  return out.replace(/[^\n\x20-\x7e\xa0-\xff]/g, "?");
}

const tint = (c: Rgb, amount: number): Rgb => c.map((v) => Math.round(v + (255 - v) * amount)) as Rgb;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function formatDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return ymd;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** A brand colour too light for white header text falls back to the dark default. */
export function headerColor(hex: string | null | undefined): Rgb {
  if (!hex) return DEFAULT_PRIMARY;
  const c = hexToRgb(hex);
  return 1.05 / (luminance(c) + 0.05) >= MIN_HEADER_CONTRAST ? c : DEFAULT_PRIMARY;
}

/** Fit text to a width, ending in an ASCII ellipsis when it is cut. Font and size must already be set. */
function fit(doc: jsPDF, text: string, width: number): string {
  if (doc.getTextWidth(text) <= width) return text;
  let cut = text;
  while (cut.length > 1 && doc.getTextWidth(`${cut}...`) > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}...`;
}

const keyLabel = (key: string) => (METRIC_LABELS as Record<string, string>)[key] ?? key;

/** Position 0..1 along the bar for a signed distance from the age-group average (positive = better). */
export const barPosition = (distancePct: number) => 0.5 + clamp(distancePct, -GAUGE_RANGE_PCT, GAUGE_RANGE_PCT) / (2 * GAUGE_RANGE_PCT);

function textLines(doc: jsPDF, text: string, width: number, size: number): string[] {
  doc.setFontSize(size);
  doc.setFont("helvetica", "normal");
  return doc.splitTextToSize(text, width) as string[];
}

function drawCollegeNote(doc: jsPDF, value: number, unit: string, withBarNote: boolean, x: number, y: number): void {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  const note = `${SECTION_TITLES.collegeStandard} ${formatValue(value, unit)}${withBarNote ? ` ${PDF_COPY.collegeNoteSuffix}` : ""}`;
  doc.text(note, x, y);
}

function buildMetricRow(m: EvalMetricResult, showCollege: boolean, primary: Rgb, secondary: Rgb): Row {
  // A comparison with named tiers is shown as value only: tier names come from data and are never printed
  const avg = m.comparison?.kind === "average" ? m.comparison : null;
  const college = showCollege ? m.collegeStandard : null;
  const height = avg ? (college ? ROW_H_COLLEGE : ROW_H) : college ? ROW_H_PLAIN + 3 : ROW_H_PLAIN;
  return {
    height,
    draw(doc, y, record) {
      record("metric", y, y + height);
      doc.setTextColor(...TEXT);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(m.label, MARGIN, y + 4);
      doc.setFontSize(13);
      doc.text(formatValue(m.value, m.unit), MARGIN, y + 11);
      if (!avg) {
        if (college) drawCollegeNote(doc, college.averageValue, m.unit, false, GAUGE_X, y + 11);
        return;
      }
      record("gauge", y, y + height);
      const barY = y + 7;
      // Status word above the bar
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text(avg.status === "at_or_better" ? PDF_COPY.statusAtOrAhead : PDF_COPY.statusBehind, GAUGE_X, y + 4);
      // Bar: behind the average on the left, ahead of it on the right
      doc.setFillColor(...LIGHT);
      doc.rect(GAUGE_X, barY, GAUGE_W / 2, BAR_H, "F");
      doc.setFillColor(...tint(primary, 0.75));
      doc.rect(GAUGE_X + GAUGE_W / 2, barY, GAUGE_W / 2, BAR_H, "F");
      // Age-group average tick
      const midX = GAUGE_X + GAUGE_W / 2;
      doc.setDrawColor(...TEXT);
      doc.setLineWidth(0.5);
      doc.line(midX, barY - 1.5, midX, barY + BAR_H + 1.5);
      record("avgTick", barY, barY + BAR_H, midX);
      // College standard tick, on the same scale
      if (college) {
        const diff = avg.operator === "lte" ? avg.averageValue - college.averageValue : college.averageValue - avg.averageValue;
        const x = GAUGE_X + GAUGE_W * barPosition((diff / Math.abs(avg.averageValue)) * 100);
        doc.setDrawColor(...secondary);
        doc.setLineWidth(0.8);
        doc.line(x, barY - 2.5, x, barY + BAR_H + 2.5);
        record("collegeTick", barY, barY + BAR_H, x);
      }
      // Athlete dot
      const dotX = GAUGE_X + GAUGE_W * barPosition(avg.distancePct);
      doc.setFillColor(...primary);
      doc.setDrawColor(...WHITE);
      doc.setLineWidth(0.6);
      doc.circle(dotX, barY + BAR_H / 2, 2.4, "FD");
      record("dot", barY, barY + BAR_H, dotX);
      // Labels under the bar
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.text(PDF_COPY.barBehind, GAUGE_X, barY + BAR_H + 4.5);
      doc.text(PDF_COPY.barAhead, GAUGE_X + GAUGE_W, barY + BAR_H + 4.5, { align: "right" });
      doc.text(`${PDF_COPY.averageLabel} ${formatValue(avg.averageValue, m.unit)}`, midX, barY + BAR_H + 4.5, { align: "center" });
      if (college) drawCollegeNote(doc, college.averageValue, m.unit, true, GAUGE_X, barY + BAR_H + 9);
    },
  };
}

/** A bold label and wrapped text, as rows of one line each so a long list stays measurable. */
function labelledRows(doc: jsPDF, label: string, text: string): Row[] {
  const lines = textLines(doc, text, CONTENT_W - 44, 10);
  return lines.map((line, i) => ({
    height: 6,
    draw(d, y) {
      d.setTextColor(...TEXT);
      if (i === 0) {
        d.setFont("helvetica", "bold");
        d.setFontSize(10);
        d.text(label, MARGIN, y + 4);
      }
      d.setFont("helvetica", "normal");
      d.setFontSize(10);
      d.text(line, MARGIN + 44, y + 4);
    },
  }));
}

function buildSections(doc: jsPDF, model: EvalReportModel, primary: Rgb, secondary: Rgb): Section[] {
  const sections: Section[] = [];
  const sel = model.selection;
  // The college gauge is per metric: assembly already folded the report-wide switch into each metric
  const showCollege = (m: EvalMetricResult) => m.collegeGauge === true;

  const note = model.coachNote?.trim();
  const noteSection: Section | null =
    note && sel?.coachNote !== false
      ? {
          kind: "coachNote",
          title: SECTION_TITLES.coachNote,
          panel: sel?.noteFirst === true,
          rows: textLines(doc, note, CONTENT_W - 8, 10.5).map((line) => ({
            height: LINE_H + 0.5,
            draw(d: jsPDF, y: number) {
              d.setFont("helvetica", "normal");
              d.setFontSize(10.5);
              d.setTextColor(...TEXT);
              d.text(line, MARGIN + 4, y + 4);
            },
          })),
        }
      : null;
  if (noteSection && sel?.noteFirst) sections.push(noteSection);

  const metrics = model.metrics ?? [];
  if (metrics.length > 0 && sel?.headline !== false) {
    sections.push({
      kind: "headline",
      title: metrics.some((m) => m.comparison) ? SECTION_TITLES.headline : PDF_COPY.resultsTitle,
      rows: metrics.map((m) => buildMetricRow(m, showCollege(m), primary, secondary)),
    });
  }

  const radarAxes = metrics.filter((m) => m.comparison?.kind === "average").slice(0, MAX_RADAR_AXES);
  if (sel?.radar === true && radarAxes.length >= MIN_RADAR_AXES) {
    sections.push({ kind: "radar", title: PDF_COPY.radarTitle, rows: [buildRadarRow(radarAxes, primary)] });
  }

  const fh = model.freshAndHealthy ?? {};
  const fhRows: Array<[string, string]> = [];
  if (fh.load) fhRows.push([FRESH_AND_HEALTHY_LABELS.load, LOAD_LABELS[fh.load] ?? String(fh.load)]);
  if (fh.balance) {
    const text = fh.balance.status === "neutral" ? `${Math.round(fh.balance.lsiPercent * 10) / 10}% ${PDF_COPY.leftRightSuffix}` : fh.balance.label;
    fhRows.push([FRESH_AND_HEALTHY_LABELS.balance, text]);
  }
  if (fh.movement) fhRows.push([FRESH_AND_HEALTHY_LABELS.movement, fh.movement]);
  if (fhRows.length > 0) {
    sections.push({
      kind: "freshAndHealthy",
      title: SECTION_TITLES.freshAndHealthy,
      rows: fhRows.map(([label, value]) => ({
        height: 8,
        draw(d: jsPDF, y: number) {
          d.setTextColor(...TEXT);
          d.setFont("helvetica", "bold");
          d.setFontSize(10);
          d.text(label, MARGIN, y + 5);
          d.setFont("helvetica", "normal");
          d.setFontSize(11);
          d.text(value, MARGIN + 44, y + 5);
        },
      })),
    });
  }

  if (sel?.strengths !== false) {
    const rows: Row[] = [];
    if (model.strengths?.length) rows.push(...labelledRows(doc, SECTION_TITLES.strengths, model.strengths.map(keyLabel).join(", ")));
    if (model.developmentAreas?.length) rows.push(...labelledRows(doc, SECTION_TITLES.developmentAreas, model.developmentAreas.map(keyLabel).join(", ")));
    if (model.limiter) rows.push(...labelledRows(doc, PDF_COPY.limiterLabel, keyLabel(model.limiter)));
    if (rows.length > 0) sections.push({ kind: "strengths", title: PDF_COPY.strengthsTitle, rows });
  }

  const trendRows = metrics
    .filter((m) => m.trend)
    .map<Row>((m) => {
      const t = m.trend!;
      const amount = formatValue(Math.abs(t.change), m.unit);
      const text =
        t.direction === "improved" ? `${PDF_COPY.trendImproved} ${amount}` : t.direction === "declined" ? `${PDF_COPY.trendDeclined} ${amount}` : PDF_COPY.trendUnchanged;
      return {
        height: 7,
        draw(d: jsPDF, y: number) {
          d.setTextColor(...TEXT);
          d.setFont("helvetica", "bold");
          d.setFontSize(10);
          d.text(m.label, MARGIN, y + 5);
          d.setFont("helvetica", "normal");
          d.text(text, MARGIN + 70, y + 5);
        },
      };
    });
  if (sel?.retestTrend !== false && trendRows.length > 0) sections.push({ kind: "retestTrend", title: SECTION_TITLES.retestTrend, rows: trendRows });

  if (noteSection && !sel?.noteFirst) sections.push(noteSection);
  return sections;
}

/** Spider chart from jsPDF primitives. An axis is the position against the age-group average; the dark ring is the average. */
function buildRadarRow(axes: EvalMetricResult[], primary: Rgb): Row {
  const R = 28;
  const height = 2 * (R + 9) + 10;
  const closed = (doc: jsPDF, pts: [number, number][], style: string) =>
    doc.lines(pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]), pts[0][0], pts[0][1], [1, 1], style, true);
  return {
    height,
    draw(doc, y) {
      const cx = PAGE_W / 2;
      const cy = y + R + 9;
      const n = axes.length;
      const point = (i: number, r: number): [number, number] => [cx + r * Math.sin((2 * Math.PI * i) / n), cy - r * Math.cos((2 * Math.PI * i) / n)];
      doc.setDrawColor(...LIGHT);
      doc.setLineWidth(0.2);
      for (const f of [0.25, 0.75, 1]) closed(doc, axes.map((_, i) => point(i, R * f)), "S");
      axes.forEach((_, i) => {
        const [x, y2] = point(i, R);
        doc.line(cx, cy, x, y2);
      });
      const poly = axes.map((m, i) => point(i, R * barPosition((m.comparison as { distancePct: number }).distancePct)));
      doc.setFillColor(...tint(primary, 0.6));
      doc.setDrawColor(...primary);
      doc.setLineWidth(0.6);
      closed(doc, poly, "FD");
      // The average ring goes on top of the polygon so it stays visible
      doc.setDrawColor(...MUTED);
      doc.setLineWidth(0.5);
      closed(doc, axes.map((_, i) => point(i, R * 0.5)), "S");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...TEXT);
      axes.forEach((m, i) => {
        const [x, y2] = point(i, R + 4);
        const side = Math.abs(x - cx) < 1 ? "center" : x > cx ? "left" : "right";
        doc.text(m.label, x, y2 + (y2 > cy ? 2 : 0), { align: side });
      });
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.text(PDF_COPY.radarCaption, cx, y + height - 2, { align: "center" });
    },
  };
}

function drawChunk(doc: jsPDF, section: Section, rows: Row[], y: number, continued: boolean, primary: Rgb, record: Rec): number {
  const body = rows.reduce((s, r) => s + r.height, 0);
  record(section.kind, y, y + TITLE_H + body);
  if (section.panel) {
    doc.setFillColor(...tint(primary, 0.93));
    doc.rect(MARGIN - 2, y - 1, CONTENT_W + 4, TITLE_H + body + 2, "F");
  }
  doc.setTextColor(...TEXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(continued ? `${section.title} (continued)` : section.title, MARGIN, y + 5);
  doc.setDrawColor(...LIGHT);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y + 7, MARGIN + CONTENT_W, y + 7);
  let ry = y + TITLE_H;
  for (const row of rows) {
    row.draw(doc, ry, record);
    ry += row.height;
  }
  return y + TITLE_H + body + SECTION_GAP;
}

function drawHeader(doc: jsPDF, model: EvalReportModel, org: EvalPdfOrg | undefined, logo: LogoFetchResult | null, color: Rgb): void {
  doc.setFillColor(...color);
  doc.rect(0, 0, PAGE_W, HEADER_H, "F");
  let textX = MARGIN;
  if (logo) {
    try {
      const url = `data:${logo.mimeType};base64,${logo.base64}`;
      const props = doc.getImageProperties(url);
      const scale = Math.min(28 / props.width, 22 / props.height);
      const w = props.width * scale;
      const h = props.height * scale;
      doc.addImage(url, logo.ext, MARGIN, (HEADER_H - h) / 2, w, h);
      textX = MARGIN + 28 + 4;
    } catch {
      // An unreadable logo is skipped; the report still renders
    }
  }
  const maxW = PAGE_W - MARGIN - textX;
  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  if (org?.name) doc.text(fit(doc, org.name, maxW), textX, 9);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(PDF_COPY.reportTitle, textX, 17);
  doc.setFontSize(13);
  doc.text(fit(doc, model.athlete?.name ?? "Athlete", maxW), textX, 26);
  const a = model.athlete ?? ({} as EvalReportModel["athlete"]);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const tail = `${PDF_COPY.evaluatedPrefix} ${formatDate(model.eventDate)}`;
  const lead = [a.age != null ? `${PDF_COPY.agePrefix} ${a.age}` : null, a.graduationYear != null ? `${PDF_COPY.classOfPrefix} ${a.graduationYear}` : null, a.sport ?? null, a.team ?? null]
    .filter(Boolean)
    .join("  |  ");
  // Long sport or team names are cut so the event date always stays visible
  const sep = "  |  ";
  doc.text(`${lead ? `${fit(doc, lead, maxW - doc.getTextWidth(`${sep}${tail}`))}${sep}` : ""}${tail}`, textX, 33);
}

function drawFooters(doc: jsPDF, model: EvalReportModel, org: EvalPdfOrg | undefined): void {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LIGHT);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, FOOTER_Y - 4, PAGE_W - MARGIN, FOOTER_Y - 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(fit(doc, `${org?.name ? `${org.name} - ` : ""}${PDF_COPY.footerLabel}, ${formatDate(model.eventDate)}`, 130), MARGIN, FOOTER_Y);
    doc.text(`Page ${i} of ${pages}`, PAGE_W - MARGIN, FOOTER_Y, { align: "right" });
    if (i > 1) doc.text(fit(doc, model.athlete?.name ?? "", 80), PAGE_W - MARGIN, 10, { align: "right" });
  }
}

/** A copy of the model with every displayed string limited to WinAnsi. */
function cleanModel(model: EvalReportModel): EvalReportModel {
  const c = (s: string | null | undefined) => (s == null ? null : winAnsi(s));
  return {
    ...model,
    athlete: { ...model.athlete, name: winAnsi(model.athlete?.name ?? ""), sport: c(model.athlete?.sport), team: c(model.athlete?.team) },
    metrics: (model.metrics ?? []).map((m) => ({ ...m, label: winAnsi(m.label), unit: winAnsi(m.unit) })),
    coachNote: c(model.coachNote),
  };
}

/** Builds the PDF and reports where every section, gauge row and gauge mark landed. `logo` is already fetched. */
export function buildEvalReportPdf(
  rawModel: EvalReportModel,
  rawOrg?: EvalPdfOrg,
  logo: LogoFetchResult | null = null,
): { doc: jsPDF; blocks: EvalPdfBlock[] } {
  const model = cleanModel(rawModel);
  const org = rawOrg ? { ...rawOrg, name: rawOrg.name ? winAnsi(rawOrg.name) : rawOrg.name } : undefined;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const primary = org?.brandPrimaryColor ? hexToRgb(org.brandPrimaryColor) : DEFAULT_PRIMARY;
  const secondary = org?.brandSecondaryColor ? hexToRgb(org.brandSecondaryColor) : ([217, 119, 6] as Rgb);

  drawHeader(doc, model, org, logo, headerColor(org?.brandPrimaryColor));

  const placed: EvalPdfBlock[] = [];
  let page = 1;
  const record: Rec = (kind, top, bottom, x) => placed.push({ kind, page, top, bottom, ...(x === undefined ? {} : { x }) });
  let pageTop = HEADER_H + SECTION_GAP;
  let y = pageTop;
  const newPage = () => {
    doc.addPage();
    page++;
    pageTop = EVAL_PDF_TOP_LIMIT;
    y = pageTop;
  };

  for (const section of buildSections(doc, model, primary, secondary)) {
    let rows = section.rows;
    let continued = false;
    while (rows.length > 0) {
      const remaining = EVAL_PDF_BOTTOM_LIMIT - y;
      const total = TITLE_H + rows.reduce((s, r) => s + r.height, 0) + SECTION_GAP;
      let take = rows.length;
      if (total > remaining) {
        // How many rows fit under the title in the space left
        let fitting = 0;
        let used = TITLE_H + SECTION_GAP;
        while (fitting < rows.length && used + rows[fitting].height <= remaining) used += rows[fitting++].height;
        const body = used - TITLE_H - SECTION_GAP;
        const worthBreaking = fitting >= MIN_ROWS_BEFORE_BREAK || body >= MIN_BODY_BEFORE_BREAK;
        if (SPLITTABLE.has(section.kind) && worthBreaking && rows.length - fitting >= 2) take = fitting;
        else if (y > pageTop) {
          newPage();
          continue;
        } else take = Math.max(1, fitting); // taller than a whole page: split anyway
      }
      y = drawChunk(doc, section, rows.slice(0, take), y, continued, primary, record);
      rows = rows.slice(take);
      continued = true;
      if (rows.length > 0) newPage();
    }
  }

  drawFooters(doc, model, org);
  return { doc, blocks: placed };
}

/** Renders the saved model with the organization's branding (logo fetched with the existing SSRF-safe helper). */
export async function renderEvalReportPdf(model: EvalReportModel, org?: EvalPdfOrg | null): Promise<jsPDF> {
  const logo = org?.brandLogoUrl ? await fetchLogoBase64(org.brandLogoUrl) : null;
  return buildEvalReportPdf(model, org ?? undefined, logo).doc;
}
