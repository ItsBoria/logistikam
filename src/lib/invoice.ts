// Invoice generators for orders. Hebrew/RTL friendly.
// - PDF: html2canvas snapshot embedded in jsPDF (renders Hebrew correctly using the page font).
// - DOCX: native docx package with RTL paragraphs.
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { saveAs } from "file-saver";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
} from "docx";

export type InvoiceOrder = {
  id: string;
  created_at: string;
  status: string;
  total: number | string;
  notes?: string | null;
  ordered_by_name?: string | null;
  contact_phone?: string | null;
  teams?: { name?: string | null } | null;
  team_name?: string | null;
  order_items: Array<{ name: string; price: number | string; quantity: number }>;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "ממתינה",
  awaiting_approval: "ממתינה לאישור",
  approved: "אושרה",
  preparing: "בהכנה",
  ready: "מוכנה לאיסוף",
  completed: "הושלמה",
  cancelled: "בוטלה",
};

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 2 }).format(n);
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("he-IL");
}
function teamName(o: InvoiceOrder) {
  return o.team_name ?? o.teams?.name ?? "";
}

// ----------------- PDF -----------------

function buildInvoiceHtml(o: InvoiceOrder, brand: { name: string; subtitle?: string }) {
  const items = o.order_items
    .map((it, i) => {
      const price = Number(it.price);
      const line = price * it.quantity;
      return `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${i + 1}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${escapeHtml(it.name)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${it.quantity}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:left;direction:ltr">${fmtCurrency(price)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:left;direction:ltr">${fmtCurrency(line)}</td>
      </tr>`;
    })
    .join("");

  return `
  <div dir="rtl" style="font-family: 'Heebo','Arial','Helvetica',sans-serif; color:#0f172a; padding:32px; width:780px; background:#fff">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:12px">
      <div>
        <div style="font-size:22px;font-weight:700">${escapeHtml(brand.name)}</div>
        ${brand.subtitle ? `<div style="font-size:12px;color:#64748b">${escapeHtml(brand.subtitle)}</div>` : ""}
      </div>
      <div style="text-align:left">
        <div style="font-size:18px;font-weight:700">חשבונית הזמנה</div>
        <div style="font-size:12px;color:#64748b">מס׳ ${o.id.slice(0, 8).toUpperCase()}</div>
        <div style="font-size:12px;color:#64748b">${fmtDate(o.created_at)}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:16px 0">
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px">
        <div style="font-size:11px;color:#64748b;margin-bottom:4px">צוות</div>
        <div style="font-weight:600">${escapeHtml(teamName(o))}</div>
        ${o.ordered_by_name ? `<div style="font-size:12px;color:#475569;margin-top:2px">מזמין: ${escapeHtml(o.ordered_by_name)}</div>` : ""}
        ${o.contact_phone ? `<div style="font-size:12px;color:#475569;direction:ltr;text-align:right">טלפון: ${escapeHtml(o.contact_phone)}</div>` : ""}
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px">
        <div style="font-size:11px;color:#64748b;margin-bottom:4px">סטטוס</div>
        <div style="font-weight:600">${escapeHtml(STATUS_LABEL[o.status] ?? o.status)}</div>
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:13px">
      <thead>
        <tr style="background:#0f172a;color:#fff">
          <th style="padding:8px;text-align:center;width:36px">#</th>
          <th style="padding:8px;text-align:right">מוצר</th>
          <th style="padding:8px;text-align:center;width:64px">כמות</th>
          <th style="padding:8px;text-align:left;width:110px">מחיר</th>
          <th style="padding:8px;text-align:left;width:120px">סה״כ</th>
        </tr>
      </thead>
      <tbody>${items}</tbody>
    </table>

    <div style="display:flex;justify-content:flex-end;margin-top:12px">
      <div style="min-width:240px;border-top:2px solid #0f172a;padding-top:8px">
        <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:700">
          <span>סה״כ לתשלום</span>
          <span style="direction:ltr">${fmtCurrency(Number(o.total))}</span>
        </div>
        <div style="font-size:11px;color:#64748b;margin-top:2px;text-align:left">כולל מע״מ</div>
      </div>
    </div>

    ${o.notes ? `<div style="margin-top:16px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px;font-size:12px"><strong>הערות:</strong> ${escapeHtml(o.notes)}</div>` : ""}

    <div style="margin-top:28px;text-align:center;font-size:11px;color:#94a3b8">
      נוצר ב-${new Date().toLocaleString("he-IL")} · ${escapeHtml(brand.name)}
    </div>
  </div>`;
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export async function downloadOrderInvoicePDF(o: InvoiceOrder, brandName = "Logistikam") {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.innerHTML = buildInvoiceHtml(o, { name: brandName, subtitle: "מסמך הזמנה" });
  document.body.appendChild(host);
  try {
    const target = host.firstElementChild as HTMLElement;
    const canvas = await html2canvas(target, { scale: 2, backgroundColor: "#ffffff" });
    const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 24;
    const imgW = pageW - margin * 2;
    const imgH = (canvas.height * imgW) / canvas.width;
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    if (imgH <= pageH - margin * 2) {
      pdf.addImage(dataUrl, "JPEG", margin, margin, imgW, imgH);
    } else {
      // Multi-page split
      const pageCanvasH = (canvas.width * (pageH - margin * 2)) / imgW;
      let rendered = 0;
      while (rendered < canvas.height) {
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = Math.min(pageCanvasH, canvas.height - rendered);
        const ctx = slice.getContext("2d")!;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(canvas, 0, rendered, canvas.width, slice.height, 0, 0, slice.width, slice.height);
        const sliceData = slice.toDataURL("image/jpeg", 0.92);
        const h = (slice.height * imgW) / slice.width;
        if (rendered > 0) pdf.addPage();
        pdf.addImage(sliceData, "JPEG", margin, margin, imgW, h);
        rendered += slice.height;
      }
    }
    pdf.save(`invoice-${o.id.slice(0, 8)}.pdf`);
  } finally {
    host.remove();
  }
}

// ----------------- DOCX -----------------

const border = { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" };
const cellBorders = { top: border, bottom: border, left: border, right: border };

function rtlPara(text: string, opts: { bold?: boolean; size?: number; align?: typeof AlignmentType[keyof typeof AlignmentType] } = {}) {
  return new Paragraph({
    bidirectional: true,
    alignment: opts.align ?? AlignmentType.RIGHT,
    children: [new TextRun({ text, bold: opts.bold, size: opts.size, font: "Arial", rightToLeft: true })],
  });
}

function headerCell(text: string) {
  return new TableCell({
    borders: cellBorders,
    width: { size: 1800, type: WidthType.DXA },
    shading: { fill: "0F172A", type: ShadingType.CLEAR, color: "auto" },
    children: [new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text, bold: true, color: "FFFFFF", font: "Arial", rightToLeft: true })],
    })],
  });
}
function bodyCell(text: string, align: typeof AlignmentType[keyof typeof AlignmentType] = AlignmentType.RIGHT) {
  return new TableCell({
    borders: cellBorders,
    width: { size: 1800, type: WidthType.DXA },
    children: [new Paragraph({
      bidirectional: true,
      alignment: align,
      children: [new TextRun({ text, font: "Arial", rightToLeft: true })],
    })],
  });
}

export async function downloadOrderInvoiceDOCX(o: InvoiceOrder, brandName = "Logistikam") {
  const items = o.order_items.map((it, i) => new TableRow({
    children: [
      bodyCell(String(i + 1), AlignmentType.CENTER),
      bodyCell(it.name),
      bodyCell(String(it.quantity), AlignmentType.CENTER),
      bodyCell(fmtCurrency(Number(it.price)), AlignmentType.LEFT),
      bodyCell(fmtCurrency(Number(it.price) * it.quantity), AlignmentType.LEFT),
    ],
  }));

  const table = new Table({
    width: { size: 9000, type: WidthType.DXA },
    columnWidths: [700, 4200, 900, 1500, 1700],
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          headerCell("#"),
          headerCell("מוצר"),
          headerCell("כמות"),
          headerCell("מחיר"),
          headerCell("סה״כ"),
        ],
      }),
      ...items,
    ],
  });

  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 } } },
      children: [
        new Paragraph({
          bidirectional: true,
          alignment: AlignmentType.RIGHT,
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: brandName, bold: true, size: 36, font: "Arial", rightToLeft: true })],
        }),
        rtlPara(`חשבונית הזמנה · מס׳ ${o.id.slice(0, 8).toUpperCase()}`, { bold: true, size: 26 }),
        rtlPara(`תאריך: ${fmtDate(o.created_at)}`),
        rtlPara(`צוות: ${teamName(o)}`),
        ...(o.ordered_by_name ? [rtlPara(`מזמין: ${o.ordered_by_name}`)] : []),
        ...(o.contact_phone ? [rtlPara(`טלפון: ${o.contact_phone}`)] : []),
        rtlPara(`סטטוס: ${STATUS_LABEL[o.status] ?? o.status}`),
        new Paragraph({ children: [new TextRun(" ")] }),
        table,
        new Paragraph({ children: [new TextRun(" ")] }),
        rtlPara(`סה״כ לתשלום: ${fmtCurrency(Number(o.total))} (כולל מע״מ)`, { bold: true, size: 28 }),
        ...(o.notes ? [new Paragraph({ children: [new TextRun(" ")] }), rtlPara(`הערות: ${o.notes}`)] : []),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `invoice-${o.id.slice(0, 8)}.docx`);
}
