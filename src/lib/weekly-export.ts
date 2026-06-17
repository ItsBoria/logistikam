// Weekly mission plan export — PDF (jsPDF + autotable + Heebo) and DOCX.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { saveAs } from "file-saver";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
} from "docx";
import { attachHeebo } from "./pdf-fonts";
import type { MissionRow, WeekRow } from "./missions.functions";

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export function isoWeekToRange(year: number, week: number): { start: Date; end: Date } {
  // ISO week: Monday-based. For Israeli display we still show Sun-Sat; here we
  // anchor on ISO Monday of given week and step back one day for Sunday start.
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

function fmtShort(d: Date) {
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
}
function fmtFull(d: Date) {
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "long", year: "numeric" });
}

// ----------- PDF -----------
export async function downloadWeeklyPDF(week: WeekRow, missions: MissionRow[], brandName = "Logistikam") {
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  await attachHeebo(pdf);

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 32;
  const rightX = pageW - margin;
  let y = margin;

  const range = isoWeekToRange(week.year, week.week);

  pdf.setFont("Heebo", "bold");
  pdf.setFontSize(16);
  pdf.text(`תכנית שבועית · שבוע ${week.week} · ${week.year}`, rightX, y + 4, { align: "right" });
  pdf.setFont("Heebo", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(110);
  pdf.text(`${fmtFull(range.start)} – ${fmtFull(range.end)}`, rightX, y + 22, { align: "right" });

  pdf.setTextColor(20);
  pdf.text(brandName, margin, y + 4);
  if (week.created_by_name) {
    pdf.setFontSize(9);
    pdf.setTextColor(110);
    pdf.text(`נכתב ע״י: ${week.created_by_name}`, margin, y + 20);
  }

  y += 38;

  // 6 working-day columns (Sun..Fri = 0..5). Days header row.
  const days = [0, 1, 2, 3, 4, 5];
  const head = days.map((d) => {
    const date = new Date(range.start);
    date.setUTCDate(range.start.getUTCDate() + d);
    return `${DAY_NAMES[d]}\n${fmtShort(date)}`;
  });

  // Group missions per day, build cell content
  const grouped: Record<number, MissionRow[]> = {};
  for (const m of missions) (grouped[m.day_of_week] ??= []).push(m);

  const bodyRow = days.map((d) => {
    const rows = grouped[d] ?? [];
    if (!rows.length) return "—";
    return rows.map((m) => `• ${m.done ? "✓ " : ""}${m.title}${m.details ? `\n   ${m.details}` : ""}`).join("\n");
  });

  autoTable(pdf, {
    startY: y,
    head: [head],
    body: [bodyRow],
    styles: { font: "Heebo", fontSize: 9, halign: "right", valign: "top", cellPadding: 6, lineWidth: 0.5, lineColor: [200, 210, 220] },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, halign: "center", fontStyle: "bold", fontSize: 10 },
    columnStyles: Object.fromEntries(days.map((d) => [d, { cellWidth: (pageW - margin * 2) / 6 }])),
    margin: { left: margin, right: margin },
  });

  let afterY = (pdf as any).lastAutoTable?.finalY ?? y + 100;
  afterY += 14;

  if (week.notes) {
    pdf.setFont("Heebo", "bold");
    pdf.setFontSize(10);
    pdf.text("הערות שבועיות:", rightX, afterY, { align: "right" });
    pdf.setFont("Heebo", "normal");
    const lines = pdf.splitTextToSize(week.notes, pageW - margin * 2);
    pdf.text(lines, rightX, afterY + 14, { align: "right" });
    afterY += 14 + lines.length * 12;
  }

  // Signatures
  const sigY = Math.max(afterY + 30, pageH - 90);
  const halfW = (pageW - margin * 2 - 40) / 2;

  function sigBlock(x: number, label: string, name: string | null, dt: string | null) {
    pdf.setDrawColor(80);
    pdf.setLineWidth(0.5);
    pdf.line(x, sigY + 30, x + halfW, sigY + 30);
    pdf.setFont("Heebo", "bold");
    pdf.setFontSize(10);
    pdf.text(label, x + halfW, sigY, { align: "right" });
    pdf.setFont("Heebo", "normal");
    pdf.setFontSize(10);
    if (name) pdf.text(name, x + halfW, sigY + 20, { align: "right" });
    if (dt) {
      pdf.setFontSize(8);
      pdf.setTextColor(110);
      pdf.text(new Date(dt).toLocaleString("he-IL"), x + halfW, sigY + 44, { align: "right" });
      pdf.setTextColor(20);
    }
  }

  sigBlock(rightX - halfW, "חתימת רכז השבוע", week.author_signature_name, week.author_signed_at);
  sigBlock(margin, "אישור מנהל בכיר", week.approver_signature_name, week.approver_signed_at);

  pdf.save(`weekly-${week.year}-w${String(week.week).padStart(2, "0")}.pdf`);
}

// ----------- DOCX -----------
const border = { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" };
const cellBorders = { top: border, bottom: border, left: border, right: border };

function rtlPara(text: string, opts: { bold?: boolean; size?: number; align?: typeof AlignmentType[keyof typeof AlignmentType] } = {}) {
  return new Paragraph({
    bidirectional: true,
    alignment: opts.align ?? AlignmentType.RIGHT,
    children: [new TextRun({ text, bold: opts.bold, size: opts.size, font: "Arial", rightToLeft: true })],
  });
}

export async function downloadWeeklyDOCX(week: WeekRow, missions: MissionRow[], brandName = "Logistikam") {
  const range = isoWeekToRange(week.year, week.week);
  const days = [0, 1, 2, 3, 4, 5];

  const grouped: Record<number, MissionRow[]> = {};
  for (const m of missions) (grouped[m.day_of_week] ??= []).push(m);

  const headRow = new TableRow({
    tableHeader: true,
    children: days.map((d) => {
      const date = new Date(range.start);
      date.setUTCDate(range.start.getUTCDate() + d);
      return new TableCell({
        borders: cellBorders,
        width: { size: 2400, type: WidthType.DXA },
        shading: { fill: "0F172A", type: ShadingType.CLEAR, color: "auto" },
        children: [
          new Paragraph({
            bidirectional: true, alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: DAY_NAMES[d], bold: true, color: "FFFFFF", font: "Arial", rightToLeft: true })],
          }),
          new Paragraph({
            bidirectional: true, alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: fmtShort(date), color: "FFFFFF", font: "Arial", rightToLeft: true, size: 18 })],
          }),
        ],
      });
    }),
  });

  const bodyRow = new TableRow({
    children: days.map((d) => {
      const list = grouped[d] ?? [];
      const paras = list.length
        ? list.flatMap((m) => {
            const lines = [
              new Paragraph({
                bidirectional: true, alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: `• ${m.done ? "✓ " : ""}${m.title}`, bold: true, font: "Arial", rightToLeft: true })],
              }),
            ];
            if (m.details) {
              lines.push(new Paragraph({
                bidirectional: true, alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: m.details, font: "Arial", rightToLeft: true, size: 18 })],
              }));
            }
            return lines;
          })
        : [rtlPara("—", { align: AlignmentType.CENTER })];
      return new TableCell({ borders: cellBorders, width: { size: 2400, type: WidthType.DXA }, children: paras });
    }),
  });

  const table = new Table({
    width: { size: 14400, type: WidthType.DXA },
    columnWidths: days.map(() => 2400),
    rows: [headRow, bodyRow],
  });

  const sigPara = (label: string, name: string | null, dt: string | null) => [
    new Paragraph({ children: [new TextRun(" ")] }),
    rtlPara(label, { bold: true }),
    rtlPara(name ? name : "_____________________"),
    ...(dt ? [rtlPara(new Date(dt).toLocaleString("he-IL"), { size: 18 })] : []),
  ];

  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
    sections: [{
      properties: { page: { size: { width: 16838, height: 11906, orientation: "landscape" as any }, margin: { top: 800, right: 800, bottom: 800, left: 800 } } },
      children: [
        new Paragraph({
          bidirectional: true, alignment: AlignmentType.RIGHT, heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: `תכנית שבועית · שבוע ${week.week} · ${week.year}`, bold: true, size: 32, font: "Arial", rightToLeft: true })],
        }),
        rtlPara(`${fmtFull(range.start)} – ${fmtFull(range.end)}`),
        ...(week.created_by_name ? [rtlPara(`נכתב ע״י: ${week.created_by_name}`)] : []),
        new Paragraph({ children: [new TextRun(" ")] }),
        table,
        ...(week.notes ? [new Paragraph({ children: [new TextRun(" ")] }), rtlPara("הערות שבועיות:", { bold: true }), rtlPara(week.notes)] : []),
        ...sigPara("חתימת רכז השבוע", week.author_signature_name, week.author_signed_at),
        ...sigPara("אישור מנהל בכיר", week.approver_signature_name, week.approver_signed_at),
        rtlPara(brandName, { size: 16 }),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `weekly-${week.year}-w${String(week.week).padStart(2, "0")}.docx`);
}
