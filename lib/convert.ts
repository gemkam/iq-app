// File conversions. Everything runs in the browser: files never leave the device.
import { elementToPdf, safeFileName } from "./pdf";
import { DEFAULT_UNITS } from "./units";
import type { Shared } from "@/components/SharedDocView";

const unitLabel = (c: string) => DEFAULT_UNITS.find((u) => u.code === c)?.label || c;
const base = (name: string) => name.replace(/\.[^.]+$/, "");
const n3 = (v: unknown) => Number(v || 0).toFixed(3);
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const asFile = (blob: Blob, name: string, type?: string) => new File([blob], name, { type: type || blob.type });

/* ------------------------------------------------------------------ */
/* PDF reader (pdf.js)                                                 */
/* ------------------------------------------------------------------ */
async function pdfjs() {
  const lib = await import("pdfjs-dist");
  lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return lib;
}

type Line = { y: number; items: { x: number; w: number; str: string }[] };

// Text of every page, grouped into lines (top to bottom) with x positions kept
async function pdfLines(file: File): Promise<Line[][]> {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: Line[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const lines: Line[] = [];
    for (const it of tc.items as { str: string; transform: number[]; width: number }[]) {
      if (!it.str || !it.str.trim()) continue;
      const x = it.transform[4];
      const y = it.transform[5];
      let line = lines.find((l) => Math.abs(l.y - y) < 3);
      if (!line) {
        line = { y, items: [] };
        lines.push(line);
      }
      line.items.push({ x, w: it.width, str: it.str });
    }
    lines.sort((a, b) => b.y - a.y);
    lines.forEach((l) => l.items.sort((a, b) => a.x - b.x));
    pages.push(lines);
  }
  return pages;
}

// Splits a line into cells where there is a clear gap between words
function lineCells(line: Line): string[] {
  const cells: string[] = [];
  let cur = "";
  let lastEnd = -Infinity;
  for (const it of line.items) {
    if (cur && it.x - lastEnd > 12) {
      cells.push(cur.trim());
      cur = "";
    }
    cur += (cur && it.x - lastEnd > 1.5 ? " " : "") + it.str;
    lastEnd = it.x + it.w;
  }
  if (cur.trim()) cells.push(cur.trim());
  return cells;
}

/* ------------------------------------------------------------------ */
/* HTML → PDF (used by Word → PDF and Excel → PDF)                     */
/* ------------------------------------------------------------------ */
async function htmlToPdf(html: string, name: string): Promise<File> {
  const holder = document.createElement("div");
  holder.style.cssText = "position:fixed;left:-10000px;top:0;width:800px;z-index:-1;background:#fff";
  holder.innerHTML = `<div class="doc-light conv-doc" style="width:800px;padding:40px;background:#fff;color:#111;font:13px/1.45 ui-sans-serif,system-ui,Arial,sans-serif">${html}</div>`;
  document.body.appendChild(holder);
  try {
    await Promise.all(
      [...holder.querySelectorAll("img")].map((img) => (img.complete ? null : new Promise((r) => ((img.onload = r), (img.onerror = r)))))
    );
    return await elementToPdf(holder.firstElementChild as HTMLElement, name);
  } finally {
    holder.remove();
  }
}

const DOC_CSS = `<style>
.conv-doc h1{font-size:24px;font-weight:800;margin:14px 0 8px}.conv-doc h2{font-size:19px;font-weight:700;margin:12px 0 6px}
.conv-doc h3{font-size:16px;font-weight:700;margin:10px 0 4px}.conv-doc p{margin:0 0 8px}
.conv-doc ul{list-style:disc;padding-left:22px;margin:0 0 8px}.conv-doc ol{list-style:decimal;padding-left:22px;margin:0 0 8px}
.conv-doc table{border-collapse:collapse;width:100%;margin:8px 0}.conv-doc td,.conv-doc th{border:1px solid #cbd5e1;padding:4px 6px;vertical-align:top}
.conv-doc th{background:#f1f5f9;font-weight:700}.conv-doc img{max-width:100%}.conv-doc strong{font-weight:700}.conv-doc em{font-style:italic}
.conv-doc .sheet-title{font-size:16px;font-weight:800;margin:18px 0 6px}
</style>`;

/* ------------------------------------------------------------------ */
/* Word → PDF                                                          */
/* ------------------------------------------------------------------ */
export async function wordToPdf(file: File): Promise<File> {
  if (!/\.docx$/i.test(file.name)) throw new Error("Please choose a Word file ending in .docx (old .doc files are not supported; save them as .docx first).");
  const mammoth = await import("mammoth");
  const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  return htmlToPdf(DOC_CSS + value, base(file.name) + ".pdf");
}

/* ------------------------------------------------------------------ */
/* Excel → PDF                                                         */
/* ------------------------------------------------------------------ */
export async function excelToPdf(file: File): Promise<File> {
  if (!/\.xlsx$/i.test(file.name)) throw new Error("Please choose an Excel file ending in .xlsx.");
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  let html = DOC_CSS;
  wb.eachSheet((ws) => {
    if (!ws.actualRowCount) return;
    html += `<div class="sheet-title">${esc(ws.name)}</div><table>`;
    let count = 0;
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      if (count++ > 2000) return;
      html += "<tr>";
      for (let c = 1; c <= Math.min(ws.actualColumnCount || row.cellCount, 30); c++) {
        const cell = row.getCell(c);
        const v = cell.text ?? "";
        html += r === 1 ? `<th>${esc(v)}</th>` : `<td>${esc(v)}</td>`;
      }
      html += "</tr>";
    });
    html += "</table>";
  });
  return htmlToPdf(html, base(file.name) + ".pdf");
}

/* ------------------------------------------------------------------ */
/* PDF → Word                                                          */
/* ------------------------------------------------------------------ */
export async function pdfToWord(file: File): Promise<File> {
  const pages = await pdfLines(file);
  const d = await import("docx");
  const children: InstanceType<typeof d.Paragraph>[] = [];
  pages.forEach((lines, pi) => {
    lines.forEach((l, li) => {
      children.push(
        new d.Paragraph({
          children: [new d.TextRun(lineCells(l).join("    "))],
          pageBreakBefore: pi > 0 && li === 0,
        })
      );
    });
    if (!lines.length) children.push(new d.Paragraph({ children: [new d.TextRun("")], pageBreakBefore: pi > 0 }));
  });
  if (!children.length) throw new Error("No text found. This PDF may be a scanned image.");
  const doc = new d.Document({ sections: [{ children }] });
  const blob = await d.Packer.toBlob(doc);
  return asFile(blob, base(file.name) + ".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
}

/* ------------------------------------------------------------------ */
/* PDF → Excel                                                         */
/* ------------------------------------------------------------------ */
export async function pdfToExcel(file: File): Promise<File> {
  const pages = await pdfLines(file);
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  let rows = 0;
  pages.forEach((lines, i) => {
    const ws = wb.addWorksheet(`Page ${i + 1}`);
    lines.forEach((l) => {
      const cells = lineCells(l).map((c) => {
        const num = c.replace(/,/g, "");
        return /^-?\d+(\.\d+)?$/.test(num) ? Number(num) : c;
      });
      ws.addRow(cells);
      rows++;
    });
    ws.columns.forEach((col) => (col.width = 18));
  });
  if (!rows) throw new Error("No text found. This PDF may be a scanned image.");
  const buf = await wb.xlsx.writeBuffer();
  return asFile(new Blob([buf]), base(file.name) + ".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

/* ------------------------------------------------------------------ */
/* Images → PDF, PDF → Images                                          */
/* ------------------------------------------------------------------ */
const readDataUrl = (f: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(f);
  });
const imgSize = (src: string) =>
  new Promise<{ w: number; h: number; img: HTMLImageElement }>((res, rej) => {
    const i = new Image();
    i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight, img: i });
    i.onerror = () => rej(new Error("Could not read one of the images (HEIC photos: open and save them as JPG first)."));
    i.src = src;
  });

export async function imagesToPdf(files: File[]): Promise<File> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const m = 8;
  for (let i = 0; i < files.length; i++) {
    const { w, h, img } = await imgSize(await readDataUrl(files[i]));
    // re-encode as JPEG (works for PNG, WEBP, GIF too)
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0);
    const ratio = Math.min((W - 2 * m) / w, (H - 2 * m) / h);
    const dw = w * ratio;
    const dh = h * ratio;
    if (i > 0) pdf.addPage();
    pdf.addImage(c.toDataURL("image/jpeg", 0.9), "JPEG", (W - dw) / 2, (H - dh) / 2, dw, dh);
  }
  return asFile(pdf.output("blob"), files.length === 1 ? base(files[0].name) + ".pdf" : "images.pdf", "application/pdf");
}

export async function pdfToImages(file: File): Promise<File> {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pngs: { name: string; blob: Blob }[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = vp.width;
    canvas.height = vp.height;
    await page.render({ canvas, viewport: vp }).promise;
    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), "image/png"));
    pngs.push({ name: `${base(file.name)}-page-${p}.png`, blob });
  }
  if (pngs.length === 1) return asFile(pngs[0].blob, pngs[0].name, "image/png");
  return zip(pngs, base(file.name) + "-images.zip");
}

/* ------------------------------------------------------------------ */
/* Merge and split PDFs                                                */
/* ------------------------------------------------------------------ */
export async function pdfPageCount(file: File): Promise<number> {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  return doc.getPageCount();
}

export async function mergePdfs(files: File[]): Promise<File> {
  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.create();
  for (const f of files) {
    const src = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  const bytes = await out.save();
  return asFile(new Blob([bytes as BlobPart]), "merged.pdf", "application/pdf");
}

// Page ranges for splitting evenly, e.g. 10 pages into 3 → 1-4, 5-7, 8-10
export function splitRanges(pages: number, parts: number): [number, number][] {
  const out: [number, number][] = [];
  const size = Math.floor(pages / parts);
  let extra = pages % parts;
  let start = 1;
  for (let i = 0; i < parts; i++) {
    const len = size + (extra-- > 0 ? 1 : 0);
    out.push([start, start + len - 1]);
    start += len;
  }
  return out;
}

export async function splitPdf(file: File, parts: number): Promise<File> {
  const { PDFDocument } = await import("pdf-lib");
  const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  const ranges = splitRanges(src.getPageCount(), parts);
  const outs: { name: string; blob: Blob }[] = [];
  for (let i = 0; i < ranges.length; i++) {
    const [a, b] = ranges[i];
    const doc = await PDFDocument.create();
    const pages = await doc.copyPages(src, Array.from({ length: b - a + 1 }, (_, k) => a - 1 + k));
    pages.forEach((p) => doc.addPage(p));
    outs.push({ name: `${base(file.name)}-part-${i + 1}-pages-${a}-${b}.pdf`, blob: new Blob([(await doc.save()) as BlobPart]) });
  }
  return zip(outs, base(file.name) + "-split.zip");
}

async function zip(files: { name: string; blob: Blob }[], name: string): Promise<File> {
  const JSZip = (await import("jszip")).default;
  const z = new JSZip();
  files.forEach((f) => z.file(f.name, f.blob));
  return asFile(await z.generateAsync({ type: "blob" }), name, "application/zip");
}

/* ------------------------------------------------------------------ */
/* This quotation / invoice → Word or Excel                             */
/* ------------------------------------------------------------------ */
function docParts(s: Shared) {
  const doc = s.doc;
  const isQ = s.type === "quotation";
  const title = isQ ? "QUOTATION" : s.company.vat_registered && Number(doc.vat_rate) > 0 ? "TAX INVOICE" : "INVOICE";
  const meta: [string, string][] = (
    isQ
      ? [
          ["Project", doc.project_name],
          ["Project code", doc.project_code],
          ["Location", doc.location],
          ["Kind attention", doc.attention_to],
          ["Valid for", doc.validity_days ? `${doc.validity_days} days` : ""],
        ]
      : [
          ["Quotation ref", s.quotation?.code],
          ["Project", s.quotation?.project_name],
          ["Location", s.quotation?.location],
          ["Kind attention", s.quotation?.attention_to],
          ["Due date", doc.due_date],
        ]
  )
    .filter(([, v]) => v)
    .map(([k, v]) => [String(k), String(v)] as [string, string]);
  const totals: [string, number][] = [["Subtotal", Number(doc.subtotal)]];
  if (Number(doc.discount_amount) > 0) totals.push(["Discount", -Number(doc.discount_amount)]);
  if (Number(doc.vat_rate) > 0) totals.push([`VAT ${Number(doc.vat_rate)}%`, Number(doc.vat_amount)]);
  totals.push(["TOTAL (OMR)", Number(doc.total)]);
  if (!isQ && Number(doc.amount_paid) > 0) {
    totals.push(["Received", Number(doc.amount_paid)]);
    totals.push(["Balance due", Number(doc.balance)]);
  }
  return { title, meta, totals, code: String(doc.code), date: String(isQ ? doc.quote_date : doc.issue_date) };
}

export async function docToWord(s: Shared): Promise<File> {
  const d = await import("docx");
  const { title, meta, totals, code, date } = docParts(s);
  const c = s.company;
  const cell = (text: string, bold = false, right = false) =>
    new d.TableCell({
      children: [new d.Paragraph({ alignment: right ? d.AlignmentType.RIGHT : d.AlignmentType.LEFT, children: [new d.TextRun({ text, bold })] })],
    });
  const doc = new d.Document({
    sections: [
      {
        children: [
          new d.Paragraph({ children: [new d.TextRun({ text: c.name, bold: true, size: 32 })] }),
          ...[c.address, [c.phone, c.email].filter(Boolean).join(" · "), [c.cr_number && `CR No: ${c.cr_number}`, c.vatin && `VATIN: ${c.vatin}`].filter(Boolean).join(" · ")]
            .filter(Boolean)
            .map((t) => new d.Paragraph({ children: [new d.TextRun(String(t))] })),
          new d.Paragraph({ spacing: { before: 240 }, children: [new d.TextRun({ text: title, bold: true, size: 30 })] }),
          new d.Paragraph({ children: [new d.TextRun(`No: ${code}    Date: ${date}`)] }),
          new d.Paragraph({ spacing: { before: 200 }, children: [new d.TextRun({ text: `To: ${s.client?.name || ""}`, bold: true })] }),
          ...meta.map(([k, v]) => new d.Paragraph({ children: [new d.TextRun(`${k}: ${v}`)] })),
          new d.Paragraph({ text: "" }),
          new d.Table({
            width: { size: 100, type: d.WidthType.PERCENTAGE },
            rows: [
              new d.TableRow({ tableHeader: true, children: ["S.No", "Description", "Qty", "Unit", "Rate", "Amount"].map((h, i) => cell(h, true, i >= 4)) }),
              ...s.items.map(
                (it, i) =>
                  new d.TableRow({
                    children: [
                      cell(String(i + 1)),
                      cell(it.description),
                      cell(it.unit === "ls" ? "1" : String(Number(it.quantity))),
                      cell(unitLabel(it.unit)),
                      cell(n3(it.unit_rate), false, true),
                      cell(n3(it.amount ?? Number(it.quantity) * Number(it.unit_rate)), false, true),
                    ],
                  })
              ),
            ],
          }),
          new d.Paragraph({ text: "" }),
          ...totals.map(
            ([k, v]) =>
              new d.Paragraph({
                alignment: d.AlignmentType.RIGHT,
                children: [new d.TextRun({ text: `${k}: ${n3(v)}`, bold: k.startsWith("TOTAL") })],
              })
          ),
          ...(s.doc.notes ? [new d.Paragraph({ spacing: { before: 240 }, children: [new d.TextRun({ text: "Notes", bold: true })] }), new d.Paragraph(String(s.doc.notes))] : []),
          ...(s.doc.terms
            ? [
                new d.Paragraph({ spacing: { before: 240 }, children: [new d.TextRun({ text: "Terms & Conditions", bold: true })] }),
                ...String(s.doc.terms)
                  .split("\n")
                  .map((t) => new d.Paragraph(t)),
              ]
            : []),
        ],
      },
    ],
  });
  const blob = await d.Packer.toBlob(doc);
  return asFile(blob, safeFileName(`${s.type === "quotation" ? "Quotation" : "Invoice"} ${code} ${s.client?.name || ""}`) + ".docx");
}

export async function docToExcel(s: Shared): Promise<File> {
  const ExcelJS = (await import("exceljs")).default;
  const { title, meta, totals, code, date } = docParts(s);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(code);
  ws.columns = [{ width: 7 }, { width: 46 }, { width: 10 }, { width: 16 }, { width: 14 }, { width: 16 }];
  ws.addRow([s.company.name]).font = { bold: true, size: 14 };
  ws.addRow([`${title}  No: ${code}  Date: ${date}`]).font = { bold: true };
  ws.addRow([`To: ${s.client?.name || ""}`]);
  meta.forEach(([k, v]) => ws.addRow([`${k}: ${v}`]));
  ws.addRow([]);
  const head = ws.addRow(["S.No", "Description", "Qty", "Unit", "Rate", "Amount"]);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B1730" } }));
  s.items.forEach((it, i) => {
    const r = ws.addRow([
      i + 1,
      it.description,
      it.unit === "ls" ? 1 : Number(it.quantity),
      unitLabel(it.unit),
      Number(it.unit_rate),
      Number(it.amount ?? Number(it.quantity) * Number(it.unit_rate)),
    ]);
    r.getCell(5).numFmt = "0.000";
    r.getCell(6).numFmt = "0.000";
  });
  ws.addRow([]);
  totals.forEach(([k, v]) => {
    const r = ws.addRow(["", "", "", "", k, v]);
    r.getCell(6).numFmt = "0.000";
    if (k.startsWith("TOTAL")) r.font = { bold: true };
  });
  const buf = await wb.xlsx.writeBuffer();
  return asFile(new Blob([buf]), safeFileName(`${s.type === "quotation" ? "Quotation" : "Invoice"} ${code} ${s.client?.name || ""}`) + ".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
