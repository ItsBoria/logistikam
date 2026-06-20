// Weekly mission plan export — PDF (jsPDF + Heebo, bidi-js for RTL) and DOCX.
import jsPDF from "jspdf";
import { saveAs } from "file-saver";
import bidiFactory from "bidi-js";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
} from "docx";
import { attachHeebo } from "./pdf-fonts";
import type { MissionRow, WeekRow, DayNoteRow } from "./missions.functions";

const bidi = bidiFactory();

// Compute visual (display) order from logical text, using the Unicode Bidi Algorithm.
// jsPDF draws text as-is, so we must hand it text already in visual order for RTL.
function toVisual(str: string): string {
  if (!str) return str;
  // Process line by line — bidi-js operates per paragraph.
  return str.split("\n").map((line) => {
    if (!line) return line;
    const levels = bidi.getEmbeddingLevels(line, "rtl");
    const segments = bidi.getReorderSegments(line, levels);
    let chars = line.split("");
    for (const seg of segments) {
      const [start, end] = seg;
      const slice = chars.slice(start, end + 1).reverse();
      // Mirror brackets/parens
      for (let i = 0; i < slice.length; i++) {
        const m = bidi.getMirroredCharacter(slice[i]);
        if (m) slice[i] = m;
      }
      chars.splice(start, end - start + 1, ...slice);
    }
    return chars.join("");
  }).join("\n");
}

const DAY_NAMES_SHORT = ["יום א'", "יום ב'", "יום ג'", "יום ד'", "יום ה'", "יום ו'", "יום ש'"];
const HEB_MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

export function isoWeekToRange(year: number, week: number): { start: Date; end: Date } {
  const simple = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = simple.getUTCDay() || 7;
  const isoMon = new Date(simple);
  isoMon.setUTCDate(simple.getUTCDate() - (dayOfWeek - 1) + (week - 1) * 7);
  const sun = new Date(isoMon);
  sun.setUTCDate(isoMon.getUTCDate() - 1);
  const sat = new Date(sun);
  sat.setUTCDate(sun.getUTCDate() + 6);
  return { start: sun, end: sat };
}

function fmtDate(d: Date) {
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}
function fmtFull(d: Date) {
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "long", year: "numeric" });
}

// ----- jsPDF RTL helpers -----
type Pdf = jsPDF;

function rtlText(pdf: Pdf, str: string, xRight: number, y: number, maxW?: number) {
  if (!str) return;
  if (maxW) {
    const lines = pdf.splitTextToSize(str, maxW) as string[];
    lines.forEach((ln, i) => {
      pdf.text(ln, xRight, y + i * (pdf.getLineHeight() / pdf.internal.scaleFactor), {
        align: "right", isInputRtl: true,
      } as any);
    });
  } else {
    pdf.text(str, xRight, y, { align: "right", isInputRtl: true } as any);
  }
}

function wrappedHeight(pdf: Pdf, str: string, maxW: number): number {
  if (!str) return 0;
  const lines = pdf.splitTextToSize(str, maxW) as string[];
  return lines.length * (pdf.getLineHeight() / pdf.internal.scaleFactor);
}

// ----------- PDF -----------
export async function downloadWeeklyPDF(
  week: WeekRow, missions: MissionRow[],
  dayNotes: DayNoteRow[] = [], brandName = "תוכנית עבודה שבועית",
) {
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  await attachHeebo(pdf);
  pdf.setFont("Heebo", "normal");

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 28;
  const range = isoWeekToRange(week.year, week.week);
  const monthName = HEB_MONTHS[range.start.getUTCMonth()];

  // --- Header (centered) ---
  pdf.setFont("Heebo", "bold"); pdf.setFontSize(20);
  pdf.text(brandName, pageW / 2, margin + 14, { align: "center", isInputRtl: true } as any);
  pdf.setFontSize(13);
  pdf.text(`שבוע ${week.week} | ${monthName} ${week.year}`, pageW / 2, margin + 34, {
    align: "center", isInputRtl: true,
  } as any);

  // optional quote line (per the paper form)
  pdf.setFont("Heebo", "normal"); pdf.setFontSize(8); pdf.setTextColor(110);
  pdf.text(`״ובחצי הלילה הם קמו והכו בקצה עולם.״`, pageW - margin, margin + 50, {
    align: "right", isInputRtl: true,
  } as any);
  pdf.setTextColor(20);

  // --- Table layout (RTL columns) ---
  const tableTop = margin + 64;
  const innerW = pageW - margin * 2;
  const labelColW = 70;
  const days = [0, 1, 2, 3, 4, 5]; // Sun..Fri
  const dayColW = (innerW - labelColW) / days.length;
  const subColW = dayColW / 2;

  // Group missions per day
  const grouped: Record<number, MissionRow[]> = {};
  for (const m of missions) (grouped[m.day_of_week] ??= []).push(m);

  // Day → influencer text
  const noteMap: Record<number, string> = {};
  for (const n of dayNotes) noteMap[n.day_of_week] = n.influencers;

  // X position helpers (right edge of each column block)
  // Label column is the rightmost slice.
  const labelRight = pageW - margin;
  const labelLeft = labelRight - labelColW;
  // Day d=0 (Sunday) is immediately left of label column
  const dayRight = (d: number) => labelLeft - d * dayColW;
  const dayLeft = (d: number) => dayRight(d) - dayColW;

  // --- Header row: day name + date, with תיכנון/ביצוע sub-headers ---
  const headH = 36;
  pdf.setDrawColor(60); pdf.setLineWidth(0.5);
  pdf.setFillColor(15, 23, 42);
  pdf.rect(margin, tableTop, innerW, headH, "FD");

  pdf.setFont("Heebo", "bold"); pdf.setFontSize(10); pdf.setTextColor(255);
  // label column header (empty / brand)
  pdf.text("קטגוריה", labelLeft + labelColW / 2, tableTop + 22, {
    align: "center", isInputRtl: true,
  } as any);

  for (const d of days) {
    const right = dayRight(d);
    const date = new Date(range.start);
    date.setUTCDate(range.start.getUTCDate() + d);
    // Day name and date (top half)
    pdf.setFontSize(10);
    pdf.text(`${DAY_NAMES_SHORT[d]} ${fmtDate(date)}`, right - dayColW / 2, tableTop + 14, {
      align: "center", isInputRtl: true,
    } as any);
    // Sub-headers (bottom half): תיכנון (right) / ביצוע (left)
    pdf.setFontSize(9);
    pdf.text("תיכנון", right - subColW / 2, tableTop + 30, { align: "center", isInputRtl: true } as any);
    pdf.text("ביצוע", right - subColW - subColW / 2, tableTop + 30, { align: "center", isInputRtl: true } as any);

    // sub-column divider
    pdf.setDrawColor(180);
    pdf.line(right - subColW, tableTop + 18, right - subColW, tableTop + headH);
    // day column right border
    pdf.setDrawColor(60);
    pdf.line(right, tableTop, right, tableTop + headH);
  }
  pdf.setTextColor(20);

  // --- Body rows ---
  type Section = { label: string; getPlan: (d: number) => string; getExec: (d: number) => string; minH: number };
  const sections: Section[] = [
    {
      label: "גורמים משפיעים",
      getPlan: (d) => noteMap[d] ?? "",
      getExec: () => "",
      minH: 60,
    },
    {
      label: "משימות",
      getPlan: (d) => (grouped[d] ?? []).map((m) => `• ${m.due_time ? m.due_time.slice(0, 5) + "  " : ""}${m.title}${m.details ? `\n   ${m.details}` : ""}`).join("\n"),
      getExec: (d) => (grouped[d] ?? []).map((m) => (m.done ? "✓" : "")).join("\n"),
      minH: 160,
    },
  ];

  let y = tableTop + headH;
  pdf.setFont("Heebo", "normal"); pdf.setFontSize(9);
  for (const sec of sections) {
    // compute row height
    let h = sec.minH;
    for (const d of days) {
      const planH = wrappedHeight(pdf, sec.getPlan(d), subColW - 8) + 12;
      if (planH > h) h = planH;
    }
    const labelMaxLineH = wrappedHeight(pdf, sec.label, labelColW - 8) + 12;
    if (labelMaxLineH > h) h = labelMaxLineH;

    // ensure fits, else new page (basic)
    if (y + h > pageH - 110) {
      pdf.addPage();
      y = margin;
    }

    // Cells: label column (light gray)
    pdf.setFillColor(241, 245, 249);
    pdf.rect(labelLeft, y, labelColW, h, "F");
    pdf.setDrawColor(60); pdf.rect(margin, y, innerW, h);
    // label text
    pdf.setFont("Heebo", "bold"); pdf.setFontSize(10);
    rtlText(pdf, sec.label, labelLeft + labelColW - 6, y + h / 2 + 3, labelColW - 12);

    pdf.setFont("Heebo", "normal"); pdf.setFontSize(9);
    for (const d of days) {
      const right = dayRight(d);
      // verticals
      pdf.setDrawColor(60);
      pdf.line(right, y, right, y + h);
      pdf.setDrawColor(180);
      pdf.line(right - subColW, y, right - subColW, y + h);

      // plan text (right sub-col)
      rtlText(pdf, sec.getPlan(d), right - 4, y + 14, subColW - 8);
      // exec text (left sub-col)
      rtlText(pdf, sec.getExec(d), right - subColW - 4, y + 14, subColW - 8);
    }
    y += h;
  }

  // Weekly notes
  if (week.notes) {
    const nh = wrappedHeight(pdf, week.notes, innerW - 12) + 22;
    if (y + nh > pageH - 110) { pdf.addPage(); y = margin; }
    pdf.setFont("Heebo", "bold"); pdf.setFontSize(10);
    rtlText(pdf, "הערות שבועיות:", pageW - margin, y + 14);
    pdf.setFont("Heebo", "normal");
    rtlText(pdf, week.notes, pageW - margin, y + 28, innerW - 12);
    y += nh;
  }

  // --- Signature blocks ---
  const sigY = pageH - 96;
  const halfW = (innerW - 30) / 2;
  pdf.setDrawColor(60);
  function sigBlock(xLeft: number, label: string, name: string | null, dt: string | null) {
    pdf.setFont("Heebo", "bold"); pdf.setFontSize(10);
    rtlText(pdf, label, xLeft + halfW, sigY);
    pdf.setFont("Heebo", "normal"); pdf.setFontSize(9);
    const lines = ["שם מלא:", "מ.א:", "דרגה:", "חתימה:", "תאריך:"];
    lines.forEach((l, i) => {
      const ly = sigY + 16 + i * 12;
      rtlText(pdf, l, xLeft + halfW, ly);
      pdf.setDrawColor(150);
      pdf.line(xLeft + halfW - 60, ly + 2, xLeft + 10, ly + 2);
    });
    if (name) {
      pdf.setFont("Heebo", "bold"); pdf.setFontSize(9);
      rtlText(pdf, name, xLeft + halfW - 64, sigY + 16);
    }
    if (dt) {
      pdf.setFont("Heebo", "normal"); pdf.setFontSize(8); pdf.setTextColor(110);
      rtlText(pdf, new Date(dt).toLocaleDateString("he-IL"), xLeft + halfW - 64, sigY + 16 + 4 * 12);
      pdf.setTextColor(20);
    }
  }
  // Right block (manager of storage site)
  sigBlock(pageW - margin - halfW, "חתימת מנהל אתר אחסון:", week.author_signature_name, week.author_signed_at);
  // Left block (work manager / senior approver)
  sigBlock(margin, "חתימת מנהל עבודה:", week.approver_signature_name, week.approver_signed_at);

  pdf.save(`weekly-${week.year}-w${String(week.week).padStart(2, "0")}.pdf`);
}

// ----------- DOCX (right-to-left) -----------
const border = { style: BorderStyle.SINGLE, size: 4, color: "94A3B8" };
const cellBorders = { top: border, bottom: border, left: border, right: border };

function rtlPara(text: string, opts: { bold?: boolean; size?: number; align?: typeof AlignmentType[keyof typeof AlignmentType]; color?: string } = {}) {
  return new Paragraph({
    bidirectional: true,
    alignment: opts.align ?? AlignmentType.RIGHT,
    children: [new TextRun({ text, bold: opts.bold, size: opts.size, color: opts.color, font: "Arial", rightToLeft: true })],
  });
}

export async function downloadWeeklyDOCX(
  week: WeekRow, missions: MissionRow[],
  dayNotes: DayNoteRow[] = [], brandName = "תוכנית עבודה שבועית",
) {
  const range = isoWeekToRange(week.year, week.week);
  const monthName = HEB_MONTHS[range.start.getUTCMonth()];
  const days = [0, 1, 2, 3, 4, 5];

  const grouped: Record<number, MissionRow[]> = {};
  for (const m of missions) (grouped[m.day_of_week] ??= []).push(m);
  const noteMap: Record<number, string> = {};
  for (const n of dayNotes) noteMap[n.day_of_week] = n.influencers;

  // Header row: label + reversed day order so visual is RTL
  const headerCells: TableCell[] = [];
  const reversed = [...days].reverse(); // Friday first visually (left), Sunday last (right) — but with bidiVisual the doc handles it
  // We'll keep logical order and rely on RTL table direction.
  const allDays = days;

  const dayHead = (d: number) => {
    const date = new Date(range.start);
    date.setUTCDate(range.start.getUTCDate() + d);
    return new TableCell({
      borders: cellBorders,
      columnSpan: 2,
      shading: { fill: "0F172A", type: ShadingType.CLEAR, color: "auto" },
      children: [rtlPara(`${["יום א'","יום ב'","יום ג'","יום ד'","יום ה'","יום ו'","יום ש'"][d]} ${fmtDate(date)}`, { bold: true, color: "FFFFFF", align: AlignmentType.CENTER })],
    });
  };

  const head1 = new TableRow({
    tableHeader: true,
    children: [
      new TableCell({
        borders: cellBorders,
        shading: { fill: "0F172A", type: ShadingType.CLEAR, color: "auto" },
        children: [rtlPara("קטגוריה", { bold: true, color: "FFFFFF", align: AlignmentType.CENTER })],
      }),
      ...allDays.map(dayHead),
    ],
  });
  const head2 = new TableRow({
    tableHeader: true,
    children: [
      new TableCell({ borders: cellBorders, children: [rtlPara("")] }),
      ...allDays.flatMap(() => [
        new TableCell({ borders: cellBorders, shading: { fill: "E2E8F0", type: ShadingType.CLEAR, color: "auto" }, children: [rtlPara("תיכנון", { bold: true, align: AlignmentType.CENTER })] }),
        new TableCell({ borders: cellBorders, shading: { fill: "E2E8F0", type: ShadingType.CLEAR, color: "auto" }, children: [rtlPara("ביצוע", { bold: true, align: AlignmentType.CENTER })] }),
      ]),
    ],
  });

  function dayDataRow(label: string, planFor: (d: number) => Paragraph[], execFor: (d: number) => Paragraph[]) {
    return new TableRow({
      children: [
        new TableCell({ borders: cellBorders, shading: { fill: "F1F5F9", type: ShadingType.CLEAR, color: "auto" }, children: [rtlPara(label, { bold: true })] }),
        ...allDays.flatMap((d) => [
          new TableCell({ borders: cellBorders, children: planFor(d).length ? planFor(d) : [rtlPara("")] }),
          new TableCell({ borders: cellBorders, children: execFor(d).length ? execFor(d) : [rtlPara("")] }),
        ]),
      ],
    });
  }

  const influencersRow = dayDataRow(
    "גורמים משפיעים",
    (d) => (noteMap[d] ? [rtlPara(noteMap[d])] : []),
    () => [],
  );
  const missionsRow = dayDataRow(
    "משימות",
    (d) => (grouped[d] ?? []).flatMap((m) => [
      rtlPara(`• ${m.due_time ? m.due_time.slice(0, 5) + "  " : ""}${m.title}`, { bold: true }),
      ...(m.details ? [rtlPara(m.details, { size: 18 })] : []),
    ]),
    (d) => (grouped[d] ?? []).map((m) => rtlPara(m.done ? "✓" : "", { align: AlignmentType.CENTER })),
  );

  const colCount = 1 + allDays.length * 2;
  const colW = Math.floor(14400 / colCount);

  const table = new Table({
    width: { size: 14400, type: WidthType.DXA },
    columnWidths: Array.from({ length: colCount }, () => colW),
    rows: [head1, head2, influencersRow, missionsRow],
    visuallyRightToLeft: true,
  });

  const sigPara = (label: string, name: string | null, dt: string | null) => [
    new Paragraph({ children: [new TextRun(" ")] }),
    rtlPara(label, { bold: true }),
    rtlPara(`שם מלא: ${name ?? "_____________________"}`),
    rtlPara("מ.א: _____________________"),
    rtlPara("דרגה: _____________________"),
    rtlPara("חתימה: _____________________"),
    rtlPara(`תאריך: ${dt ? new Date(dt).toLocaleDateString("he-IL") : "_____________________"}`),
  ];

  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
    sections: [{
      properties: { page: { size: { width: 16838, height: 11906, orientation: "landscape" as any }, margin: { top: 700, right: 700, bottom: 700, left: 700 } } },
      children: [
        new Paragraph({
          bidirectional: true, alignment: AlignmentType.CENTER, heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: brandName, bold: true, size: 36, font: "Arial", rightToLeft: true })],
        }),
        new Paragraph({
          bidirectional: true, alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: `שבוע ${week.week} | ${monthName} ${week.year}`, size: 26, font: "Arial", rightToLeft: true })],
        }),
        new Paragraph({ children: [new TextRun(" ")] }),
        table,
        ...(week.notes ? [new Paragraph({ children: [new TextRun(" ")] }), rtlPara("הערות שבועיות:", { bold: true }), rtlPara(week.notes)] : []),
        ...sigPara("חתימת מנהל אתר אחסון", week.author_signature_name, week.author_signed_at),
        ...sigPara("חתימת מנהל עבודה", week.approver_signature_name, week.approver_signed_at),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `weekly-${week.year}-w${String(week.week).padStart(2, "0")}.docx`);
}
