/**
 * Eval Report One-Pager PDF Generator
 * Produces a branded, parent-facing evaluation report using jsPDF.
 * Single A4 page with header, gauge bars, and recommendations.
 */

import { jsPDF } from 'jspdf';
import type { EvalReportData, EvalMetricData } from '../services/eval-report-service';

// ---------- Colors (RGB tuples) ----------
const SLATE_900: [number, number, number] = [15, 23, 42];
const BLUE_500: [number, number, number] = [59, 130, 246];
const EMERALD_500: [number, number, number] = [16, 185, 129];
const GRAY_500: [number, number, number] = [107, 114, 128];
const GRAY_800: [number, number, number] = [31, 41, 55];
const WHITE: [number, number, number] = [255, 255, 255];
const GRAY_200: [number, number, number] = [229, 231, 235];
const DARK_DOT: [number, number, number] = [30, 30, 30];

// Layout constants
const PAGE_W = 210; // A4 width mm
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BAR_W = 120;
const BAR_H = 5;
const BAR_X = PAGE_W - MARGIN - BAR_W; // right-aligned gauge bars

export function generateEvalOnePagerPDF(data: EvalReportData): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 0;

  // ====== HEADER BAND ======
  y = drawHeader(doc, data, y);

  // ====== PERFORMANCE METRICS ======
  y = drawPerformanceSection(doc, data, y);

  // ====== ASSESSMENT ======
  y = drawAssessment(doc, data, y);

  // ====== FOOTER BAND ======
  drawFooter(doc);

  return doc;
}

// ---------- Header ----------

function drawHeader(doc: jsPDF, data: EvalReportData, startY: number): number {
  const bandH = 42;
  doc.setFillColor(...SLATE_900);
  doc.rect(0, startY, PAGE_W, bandH, 'F');

  doc.setTextColor(...WHITE);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('BIG TIME ATHLETES', MARGIN, startY + 12);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('Athletic Performance Evaluation Report', MARGIN, startY + 20);

  doc.setFontSize(10);
  const sportLabel = data.sport.charAt(0) + data.sport.slice(1).toLowerCase();
  const gradText = data.graduationYear ? ` | Class of ${data.graduationYear}` : '';
  const teamText = data.teamName ? ` | ${data.teamName}` : '';
  doc.text(data.athleteName, MARGIN, startY + 29);
  doc.text(
    `${sportLabel}${gradText}${teamText} | ${data.evaluationDate}`,
    MARGIN,
    startY + 35,
  );

  return startY + bandH + 6;
}

// ---------- Performance Section ----------

function drawPerformanceSection(doc: jsPDF, data: EvalReportData, startY: number): number {
  let y = startY;

  // Section title
  doc.setTextColor(...GRAY_800);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('PERFORMANCE RESULTS', MARGIN, y);
  y += 7;

  // Group by category
  const categories: Array<{ label: string; key: string }> = [
    { label: 'SPEED', key: 'speed' },
    { label: 'POWER', key: 'power' },
    { label: 'AGILITY', key: 'agility' },
  ];

  for (const cat of categories) {
    const catMetrics = data.metrics.filter(m => m.category === cat.key);
    if (catMetrics.length === 0) continue;

    // Category header
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BLUE_500);
    doc.text(cat.label, MARGIN, y);
    y += 5;

    for (const metric of catMetrics) {
      y = drawMetricRow(doc, metric, y);
      y += 2;
    }

    y += 3;
  }

  return y;
}

// ---------- Metric Row with Gauge Bar ----------

function drawMetricRow(doc: jsPDF, metric: EvalMetricData, startY: number): number {
  let y = startY;

  // Metric label + value on the left
  doc.setTextColor(...GRAY_800);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(metric.label, MARGIN, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  const valueStr = formatMetricValue(metric.athleteValue, metric.unit);
  doc.text(valueStr, MARGIN + 45, y);

  // D1 range text
  if (metric.d1Average !== null && metric.d1Elite !== null) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...GRAY_500);
    const rangeStr = `D1: ${formatMetricValue(metric.d1Average, metric.unit)} – ${formatMetricValue(metric.d1Elite, metric.unit)}`;
    doc.text(rangeStr, MARGIN + 45, y + 4);
  }

  // Draw gauge bar
  if (metric.hsAverage !== null && metric.d1Average !== null && metric.d1Elite !== null) {
    drawGaugeBar(doc, metric, y - 3);
  }

  return y + BAR_H + 3;
}

// ---------- Gauge Bar ----------

function drawGaugeBar(doc: jsPDF, metric: EvalMetricData, barY: number): void {
  const hsAvg = metric.hsAverage!;
  const d1Avg = metric.d1Average!;
  const d1Elite = metric.d1Elite!;

  // Determine the full range for the gauge.
  // We divide the bar into 3 proportional zones:
  //   [HS Avg zone (gray)] [HS→D1 zone (blue)] [D1→Elite zone (green)]
  // The proportions are based on the numeric range between the tiers.

  let rangeHS_D1: number;
  let rangeD1_Elite: number;

  if (metric.lowerIsBetter) {
    // For time metrics: HS Avg is highest (worst), D1 Elite is lowest (best)
    rangeHS_D1 = Math.abs(hsAvg - d1Avg);
    rangeD1_Elite = Math.abs(d1Avg - d1Elite);
  } else {
    rangeHS_D1 = Math.abs(d1Avg - hsAvg);
    rangeD1_Elite = Math.abs(d1Elite - d1Avg);
  }

  const totalRange = rangeHS_D1 + rangeD1_Elite;
  if (totalRange === 0) return;

  // Add a 15% "below HS" zone on the left
  const belowFraction = 0.15;
  const remainingW = BAR_W * (1 - belowFraction);
  const zone1W = BAR_W * belowFraction; // below HS (gray)
  const zone2W = remainingW * (rangeHS_D1 / totalRange); // HS→D1 (blue)
  const zone3W = remainingW * (rangeD1_Elite / totalRange); // D1→Elite (green)

  // Draw zones
  // Zone 1: Below HS Average (light gray)
  doc.setFillColor(...GRAY_200);
  doc.rect(BAR_X, barY, zone1W, BAR_H, 'F');

  // Zone 2: HS Average → D1 Average (blue)
  doc.setFillColor(...BLUE_500);
  doc.roundedRect(BAR_X + zone1W, barY, zone2W, BAR_H, 0, 0, 'F');

  // Zone 3: D1 Average → D1 Elite (green)
  doc.setFillColor(...EMERALD_500);
  doc.roundedRect(BAR_X + zone1W + zone2W, barY, zone3W, BAR_H, 0, 0, 'F');

  // Athlete position dot
  const gaugePos = metric.gaugePosition;
  if (gaugePos !== null) {
    // gaugePosition: 0 = HS Avg (start of zone2), 100 = D1 Elite (end of zone3)
    // Map to bar X
    const hsX = BAR_X + zone1W;
    const eliteX = BAR_X + zone1W + zone2W + zone3W;
    let dotX = hsX + (gaugePos / 100) * (eliteX - hsX);
    // Clamp to bar bounds
    dotX = Math.max(BAR_X + 1.5, Math.min(BAR_X + BAR_W - 1.5, dotX));

    const dotR = 2.5;
    doc.setFillColor(...DARK_DOT);
    doc.circle(dotX, barY + BAR_H / 2, dotR, 'F');
    // White inner for visibility
    doc.setFillColor(...WHITE);
    doc.circle(dotX, barY + BAR_H / 2, dotR * 0.4, 'F');
  }

  // Tier labels below the bar
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY_500);
  const labelY = barY + BAR_H + 3;
  doc.text('HS Avg', BAR_X + zone1W, labelY, { align: 'center' });
  doc.text('D1 Avg', BAR_X + zone1W + zone2W, labelY, { align: 'center' });
  doc.text('D1 Elite', BAR_X + zone1W + zone2W + zone3W, labelY, { align: 'center' });
}

// ---------- Assessment Section ----------

function drawAssessment(doc: jsPDF, data: EvalReportData, startY: number): number {
  let y = startY + 2;

  // Thin divider
  doc.setDrawColor(...GRAY_200);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 6;

  // "WHERE YOU STAND"
  doc.setTextColor(...GRAY_800);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('WHERE YOU STAND', MARGIN, y);
  y += 6;

  const colW = CONTENT_W / 2;

  // Top Strengths (left column)
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...EMERALD_500);
  doc.text('Top Strengths', MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY_800);
  doc.setFontSize(8);
  for (const s of data.strengths) {
    y += 4;
    doc.text(`• ${s}`, MARGIN + 2, y);
  }

  // Development Areas (right column)
  let rightY = startY + 8 + 6; // align with strengths header
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BLUE_500);
  doc.text('Key Development Areas', MARGIN + colW, rightY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY_800);
  doc.setFontSize(8);
  for (const d of data.developmentAreas) {
    rightY += 4;
    doc.text(`• ${d}`, MARGIN + colW + 2, rightY);
  }

  y = Math.max(y, rightY) + 8;

  // RECOMMENDATION section
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...GRAY_800);
  doc.text('RECOMMENDATION', MARGIN, y);
  y += 6;

  // Pathway checkboxes
  doc.setFontSize(9);
  const pathways: Array<'Foundation' | 'Performance' | 'Elite'> = ['Foundation', 'Performance', 'Elite'];
  let px = MARGIN;
  for (const p of pathways) {
    const isSelected = data.pathway === p;
    // Checkbox
    doc.setDrawColor(...GRAY_500);
    doc.setLineWidth(0.3);
    doc.rect(px, y - 3, 3, 3);
    if (isSelected) {
      doc.setFillColor(...SLATE_900);
      doc.rect(px + 0.5, y - 2.5, 2, 2, 'F');
    }
    doc.setFont('helvetica', isSelected ? 'bold' : 'normal');
    doc.setTextColor(...GRAY_800);
    doc.text(p, px + 5, y);
    px += 45;
  }
  y += 6;

  // Training Focus
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Training Focus:', MARGIN, y);
  doc.setFont('helvetica', 'normal');
  for (const focus of data.trainingFocus) {
    y += 4;
    doc.text(`• ${focus}`, MARGIN + 2, y);
  }
  y += 5;

  // Recommended program
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(`Recommended: 6-Week ${data.pathway} Block, 2x/week, 75 min`, MARGIN, y);

  return y + 4;
}

// ---------- Footer Band ----------

function drawFooter(doc: jsPDF): void {
  const bandH = 16;
  const pageH = 297; // A4 height
  const bandY = pageH - bandH;

  doc.setFillColor(...SLATE_900);
  doc.rect(0, bandY, PAGE_W, bandH, 'F');

  doc.setTextColor(...WHITE);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(
    'Founding Athlete Program — $100/month (locked for life)',
    PAGE_W / 2,
    bandY + 6,
    { align: 'center' },
  );

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(
    'Coach John Hull, CSCS | Big Time Athletes | bigtimeathletes.com',
    PAGE_W / 2,
    bandY + 11,
    { align: 'center' },
  );
}

// ---------- Helpers ----------

function formatMetricValue(value: number, unit: string): string {
  if (unit === 's') return `${value.toFixed(2)}s`;
  if (unit === 'in') return `${value.toFixed(1)}"`;
  if (unit === 'mph') return `${value.toFixed(1)} mph`;
  return `${value.toFixed(2)}${unit ? ` ${unit}` : ''}`;
}
