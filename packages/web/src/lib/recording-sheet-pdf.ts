/**
 * Printable PDF of the recording sheet (Letter landscape), for writing results by hand at the event.
 * Same athletes, order and metric columns as the CSV / XLSX (RecordingSheet). When the metric columns
 * do not fit the page width they flow onto column "strips", each repeating the # and Athlete columns.
 * Page order: every athlete for strip 1, then every athlete for strip 2, and so on.
 * jspdf and jspdf-autotable are loaded on demand so they stay out of the main bundle.
 */
import { hasPrintedValues, type RecordingSheet } from "@/lib/recording-sheet";

/** Page geometry in points (1 in = 72 pt) */
export const PDF_LAYOUT = {
  pageWidth: 792,
  pageHeight: 612,
  margin: 36,
  /** Event name, date / location / strip label, event id, characters note */
  headerHeight: 66,
  /** Table header: up to 2 label lines and the unit */
  tableHeadHeight: 44,
  footerHeight: 18,
  /** About 0.36 in, room to hand-write a value */
  rowHeight: 26,
  numberWidth: 24,
  athleteWidth: 160,
  minMetricWidth: 72,
  maxMetricWidth: 108,
};

export interface PdfStrip {
  /** Metric index range [start, end) */
  start: number;
  end: number;
  metricWidth: number;
}

export interface PdfPagePlan {
  strip: number;
  /** Athlete index range [rowStart, rowEnd) */
  rowStart: number;
  rowEnd: number;
  /** "Columns 1-7 of 14 (part 1 of 2)", only when there is more than one strip */
  label: string | undefined;
}

/** Decide the column strips and which athletes go on which page */
export function planRecordingSheetPdf(metricCount: number, athleteCount: number, layout = PDF_LAYOUT) {
  const L = layout;
  const metricArea = L.pageWidth - 2 * L.margin - L.numberWidth - L.athleteWidth;
  const maxPerStrip = Math.max(1, Math.floor(metricArea / L.minMetricWidth));
  const stripCount = Math.max(1, Math.ceil(metricCount / maxPerStrip));
  const perStrip = Math.ceil(metricCount / stripCount); // balanced: 12 -> 6 + 6, not 7 + 5
  const strips: PdfStrip[] = Array.from({ length: stripCount }, (_, i) => {
    const start = i * perStrip;
    const end = Math.min(metricCount, start + perStrip);
    return { start, end, metricWidth: Math.min(L.maxMetricWidth, metricArea / Math.max(1, end - start)) };
  });

  const tableArea = L.pageHeight - 2 * L.margin - L.headerHeight - L.tableHeadHeight - L.footerHeight;
  const rowsPerPage = Math.max(1, Math.floor(tableArea / L.rowHeight));
  const chunks = Math.max(1, Math.ceil(athleteCount / rowsPerPage));
  const pages: PdfPagePlan[] = strips.flatMap((s, strip) =>
    Array.from({ length: chunks }, (_, c) => ({
      strip,
      rowStart: c * rowsPerPage,
      rowEnd: Math.min(athleteCount, (c + 1) * rowsPerPage),
      label: stripCount > 1 ? `Columns ${s.start + 1}-${s.end} of ${metricCount} (part ${strip + 1} of ${stripCount})` : undefined,
    })),
  );
  return { strips, rowsPerPage, pages };
}

const PLAIN: Record<string, string> = { "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-" };

/**
 * Text the standard Helvetica font can print: Latin-1 only. Typographic quotes and dashes become plain
 * ones; anything else outside Latin-1 becomes "?" and is flagged.
 * shortcut: no embedded Unicode font, so non-Latin names print as "?"; embed a font if users need them.
 */
export function toPdfText(text: string): { text: string; altered: boolean } {
  let altered = false;
  const out = Array.from(text.normalize("NFC"), (ch) => {
    if (PLAIN[ch]) return PLAIN[ch];
    const c = ch.codePointAt(0)!;
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff)) return ch;
    altered = true;
    return "?";
  }).join("");
  return { text: out, altered };
}

export async function recordingSheetToPdf(sheet: RecordingSheet): Promise<Uint8Array> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const L = PDF_LAYOUT;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const plan = planRecordingSheetPdf(sheet.metrics.length, sheet.athletes.length);

  let altered = false;
  const clean = (text: string) => {
    const r = toPdfText(text);
    altered ||= r.altered;
    return r.text;
  };
  /** First line of text that fits width, with "..." when cut */
  const fit = (text: string, width: number) => {
    // shortcut: 200 characters is far wider than any line on the page, so trimming one at a time stays cheap
    const capped = text.length > 200 ? text.slice(0, 200) : text;
    if (capped === text && doc.getTextWidth(text) <= width) return text;
    let cut = capped;
    while (cut && doc.getTextWidth(`${cut}...`) > width) cut = cut.slice(0, -1);
    return `${cut.trimEnd()}...`;
  };

  const eventName = clean(sheet.eventName);
  const location = sheet.location ? clean(sheet.location) : "";
  const names = sheet.athletes.map((a) => clean(a.name));
  const metrics = sheet.metrics.map((m) => ({ label: clean(m.label), unit: m.unit ? clean(m.unit) : "" }));

  const top = L.margin + L.headerHeight;
  const cellPad = 3;
  plan.pages.forEach((page, i) => {
    if (i > 0) doc.addPage();
    const strip = plan.strips[page.strip];
    const stripMetrics = metrics.slice(strip.start, strip.end);
    const textWidth = strip.metricWidth - 2 * cellPad;
    doc.setFont("helvetica", "bold").setFontSize(8);
    const head = stripMetrics.map((m) => {
      const lines: string[] = doc.splitTextToSize(m.label, textWidth);
      const label = lines.length > 2 ? [lines[0], fit(lines.slice(1).join(" "), textWidth)] : lines;
      return [...label, ...(m.unit ? [fit(`(${m.unit})`, textWidth)] : [])].join("\n");
    });
    // Saved values: small grey text at the top right of a shaded box, so the box still takes a handwritten value
    doc.setFont("helvetica", "normal").setFontSize(7);
    const athletesOnPage = sheet.athletes.slice(page.rowStart, page.rowEnd);
    const printed = athletesOnPage.map((a) =>
      sheet.metrics.slice(strip.start, strip.end).map((m) => {
        const value = a.values?.[m.code];
        if (!value) return "";
        const trials = a.trials?.[m.code] ?? 1;
        return fit(clean(`${value}${trials > 1 ? ` (${trials} trials)` : ""}`), textWidth);
      }),
    );
    autoTable(doc, {
      startY: top,
      margin: { top, left: L.margin, right: L.margin, bottom: L.margin + L.footerHeight },
      theme: "grid",
      tableWidth: L.numberWidth + L.athleteWidth + stripMetrics.length * strip.metricWidth,
      head: [["#", "Athlete", ...head]],
      body: names.slice(page.rowStart, page.rowEnd).map((name, r) => [
        String(page.rowStart + r + 1),
        name,
        ...printed[r],
      ]),
      didParseCell: (data) => {
        if (data.section !== "body" || data.column.index < 2) return;
        if (!printed[data.row.index]?.[data.column.index - 2]) return;
        Object.assign(data.cell.styles, {
          fillColor: [210, 210, 210],
          fontSize: 7,
          textColor: [90, 90, 90],
          halign: "right",
          valign: "top",
          overflow: "ellipsize",
        });
      },
      styles: {
        font: "helvetica",
        fontSize: 10,
        cellPadding: cellPad,
        minCellHeight: L.rowHeight,
        valign: "middle",
        lineColor: [120, 120, 120],
        lineWidth: 0.5,
        textColor: [20, 20, 20],
      },
      headStyles: {
        fontSize: 8,
        fontStyle: "bold",
        minCellHeight: L.tableHeadHeight,
        valign: "bottom",
        halign: "center",
        fillColor: [230, 230, 230],
      },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      columnStyles: {
        0: { cellWidth: L.numberWidth, fontSize: 8, halign: "right", textColor: [110, 110, 110] },
        1: { cellWidth: L.athleteWidth, overflow: "ellipsize" },
        ...Object.fromEntries(stripMetrics.map((_, c) => [c + 2, { cellWidth: strip.metricWidth }])),
      },
    });
  });

  const legend = hasPrintedValues(sheet) ? "Shaded = already recorded (newest saved value shown). " : "";

  // Page header and footer, drawn once the page count is known
  const width = L.pageWidth - 2 * L.margin;
  const total = doc.getNumberOfPages();
  if (total !== plan.pages.length) console.warn(`Recording sheet PDF has ${total} pages, planned ${plan.pages.length}`);
  for (let p = 1; p <= total; p++) {
    const i = p - 1;
    const page = plan.pages[i] ?? plan.pages[plan.pages.length - 1];
    doc.setPage(p);
    doc.setTextColor(20, 20, 20).setFont("helvetica", "normal").setFontSize(10);
    const pageText = `Page ${i + 1} of ${total}`;
    doc.text(pageText, L.pageWidth - L.margin, L.margin + 12, { align: "right" });
    doc.setFont("helvetica", "bold").setFontSize(15);
    doc.text(fit(eventName, width - 90), L.margin, L.margin + 12);
    doc.setFont("helvetica", "normal").setFontSize(10);
    const stripWidth = page.label ? 220 : 0;
    const details = [sheet.eventDate && `Date: ${sheet.eventDate}`, location && `Location: ${location}`].filter(Boolean).join("   ");
    doc.text(fit(details, width - stripWidth), L.margin, L.margin + 30);
    if (page.label) {
      doc.setFont("helvetica", "bold");
      doc.text(page.label, L.pageWidth - L.margin, L.margin + 30, { align: "right" });
    }
    doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(110, 110, 110);
    doc.text(`Event ID: ${sheet.eventId}`, L.margin, L.margin + 44);
    if (i === 0 && altered) {
      doc.setFont("helvetica", "italic").setFontSize(8);
      doc.text('Some text contains characters this PDF cannot print (shown as "?").', L.margin, L.margin + 56);
    }
    doc.setFont("helvetica", "normal").setFontSize(8);
    doc.text(
      `${legend}Enter these results on the event's Data Entry page in AthleteMetrics.`,
      L.margin,
      L.pageHeight - L.margin,
    );
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
