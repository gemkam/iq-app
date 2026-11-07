"use client";
import Omr, { OmrSign } from "@/components/Omr";
import { date, num } from "@/lib/format";
import { FONTS, templateOf, type PdfTemplate } from "@/lib/pdfTemplate";
import type { Company, Item, Unit } from "@/lib/types";

type Meta = { k: string; v: string | null | undefined };

// Images from our own storage can be put into PDFs; other web images are only shown
const cors = (url: string) => (url.includes(".supabase.co/") ? ("anonymous" as const) : undefined);

/**
 * The printed / shared / PDF page of a quotation or invoice.
 * Its look comes from the company's PDF design (Companies → PDF design).
 */
export default function PrintDoc({
  company,
  title,
  number,
  docDate,
  billTo,
  meta,
  items,
  units,
  totals,
  terms,
  notes,
  footer,
  shared,
  bare,
  template,
}: {
  company: Company;
  title: string;
  number: string;
  docDate: string;
  billTo: { name?: string | null; attention?: string | null; mobile?: string | null; vatin?: string | null };
  meta: Meta[];
  items: Item[];
  units: Unit[];
  totals: { k: string; v: number; bold?: boolean }[];
  terms?: string | null;
  notes?: string | null;
  footer?: React.ReactNode;
  shared?: boolean;
  bare?: boolean; // no buttons (used when making a PDF or a preview)
  template?: PdfTemplate; // unsaved design (live preview)
}) {
  const t = template || templateOf(company);
  const s = t.show;
  const unitLabel = (c: string) => units.find((u) => u.code === c)?.label || c;

  // Document titles from the design
  const shownTitle =
    title === "QUOTATION"
      ? t.quotation_title
      : title === "TAX INVOICE"
        ? t.tax_invoice_title
        : title === "INVOICE"
          ? t.invoice_title
          : title === "DRAFT INVOICE"
            ? `DRAFT ${t.invoice_title}`
            : title;

  const modern = t.style === "modern";
  const bold = t.style === "bold";
  const minimal = t.style === "minimal";
  const headOnColor = modern || bold;
  const ink = headOnColor ? "#ffffff" : t.primary;
  const sub = headOnColor ? "rgba(255,255,255,0.8)" : "#475569";

  const logo = t.logo_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={t.logo_url} alt="" crossOrigin={cors(t.logo_url)} style={{ height: t.logo_size, maxWidth: t.logo_size * 2.5 }} className="object-contain" />
  ) : null;

  const companyBlock = (
    <div className={t.logo_pos === "center" ? "text-center" : ""}>
      <h1 className="text-xl font-black" style={{ color: ink }}>{company.name}</h1>
      {s.name_ar && company.name_ar && (
        <p dir="rtl" className="font-semibold" style={{ color: ink }}>{company.name_ar}</p>
      )}
      {s.address && company.address && <p style={{ color: sub }}>{company.address}</p>}
      {(s.phone || s.email) && (
        <p style={{ color: sub }}>{[s.phone && company.phone, s.email && company.email].filter(Boolean).join(" · ")}</p>
      )}
      {(s.cr || s.vatin) && (
        <p style={{ color: sub }}>
          {s.cr && company.cr_number && <>CR No: {company.cr_number}</>}
          {s.cr && company.cr_number && s.vatin && company.vatin && " · "}
          {s.vatin && company.vatin && <>VATIN: {company.vatin}</>}
        </p>
      )}
    </div>
  );

  const titleBlock = (
    <div className={t.logo_pos === "center" ? "text-center" : "text-right"}>
      <h2 className="text-2xl font-black tracking-wide" style={{ color: headOnColor ? "#ffffff" : t.accent }}>{shownTitle}</h2>
      <p className="font-bold" style={{ color: headOnColor ? "#ffffff" : undefined }}>No: {number}</p>
      <p style={{ color: headOnColor ? "rgba(255,255,255,0.85)" : undefined }}>Date: {date(docDate)}</p>
    </div>
  );

  const headerBg = modern
    ? { background: `linear-gradient(120deg, ${t.primary}, ${t.primary} 60%, ${t.accent})` }
    : bold
      ? { background: t.primary }
      : {};

  const showCols = { sno: s.sno, unit: s.unit, rate: s.rate };
  const signLeft = t.sign_left.replace("{company}", company.name);
  const hasBank = s.bank && (t.bank.name || t.bank.account || t.bank.iban);

  return (
    <div
      className="doc-light relative mx-auto max-w-[800px] overflow-hidden bg-white p-6 text-[13px] text-slate-900 sm:p-10 print:p-0"
      style={{ fontFamily: FONTS[t.font] }}
    >
      <div className={`no-print mb-6 flex gap-2 ${bare ? "hidden" : ""}`}>
        <button className="btn-primary" onClick={() => window.print()}>Print / Save as PDF</button>
        {!shared && <button className="btn-light" onClick={() => window.close()}>Close</button>}
      </div>

      {/* Watermark with the logo or company name */}
      {s.watermark && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center opacity-[0.05]" aria-hidden>
          {t.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.logo_url} alt="" crossOrigin={cors(t.logo_url)} className="w-2/3 object-contain" />
          ) : (
            <span className="-rotate-12 text-7xl font-black" style={{ color: t.primary }}>{company.name}</span>
          )}
        </div>
      )}

      {/* ---------- Header ---------- */}
      <header
        className={`relative ${headOnColor ? "-mx-6 -mt-2 px-6 py-5 sm:-mx-10 sm:px-10" : "pb-4"} ${minimal ? "border-b" : ""}`}
        style={{
          ...headerBg,
          borderBottom: minimal ? "1px solid #cbd5e1" : headOnColor ? undefined : `4px solid ${t.primary}`,
        }}
      >
        {t.logo_pos === "center" ? (
          <div className="flex flex-col items-center gap-2">
            {logo}
            {companyBlock}
            <div className="mt-2 w-full">{titleBlock}</div>
          </div>
        ) : (
          <div className={`flex items-start justify-between gap-6 ${t.logo_pos === "right" ? "flex-row-reverse" : ""}`}>
            <div className={`flex items-start gap-3 ${t.logo_pos === "right" ? "flex-row-reverse text-right" : ""}`}>
              {logo}
              {companyBlock}
            </div>
            <div className={t.logo_pos === "right" ? "text-left [&>*]:text-left" : ""}>{titleBlock}</div>
          </div>
        )}
      </header>
      {bold && <div className="-mx-6 h-1.5 sm:-mx-10" style={{ background: t.accent }} />}

      {/* ---------- Bill to + details ---------- */}
      <section className="relative mt-4 grid grid-cols-2 gap-6">
        <div>
          <p className="text-xs font-bold uppercase" style={{ color: minimal ? "#64748b" : t.accent }}>To</p>
          <p className="text-base font-bold">{billTo.name}</p>
          {billTo.attention && <p>Kind attn: {billTo.attention}</p>}
          {billTo.mobile && <p>Mobile: {billTo.mobile}</p>}
          {billTo.vatin && <p>VATIN: {billTo.vatin}</p>}
        </div>
        <div className="space-y-0.5">
          {meta
            .filter((m) => m.v)
            .map((m) => (
              <p key={m.k}>
                <span className="text-slate-500">{m.k}:</span> <b>{m.v}</b>
              </p>
            ))}
        </div>
      </section>

      {/* ---------- Items ---------- */}
      <table className="relative mt-5 w-full border-collapse">
        <thead>
          <tr
            className="text-left"
            style={minimal ? { borderBottom: `2px solid ${t.primary}`, color: t.primary } : { background: t.primary, color: "#ffffff" }}
          >
            {showCols.sno && <th className="w-10 px-2 py-2">S.No</th>}
            <th className="px-2 py-2">Description</th>
            <th className="px-2 py-2 text-right">Qty</th>
            {showCols.unit && <th className="px-2 py-2">Unit</th>}
            {showCols.rate && <th className="px-2 py-2 text-right">Rate</th>}
            <th className="px-2 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} className="border-b border-slate-200 align-top" style={!minimal && i % 2 === 1 ? { background: `${t.primary}08` } : undefined}>
              {showCols.sno && <td className="px-2 py-2">{i + 1}</td>}
              <td className="whitespace-pre-wrap px-2 py-2">{it.description}</td>
              <td className="px-2 py-2 text-right">{it.unit === "ls" ? "1" : Number(it.quantity)}</td>
              {showCols.unit && <td className="px-2 py-2">{unitLabel(it.unit)}</td>}
              {showCols.rate && <td className="px-2 py-2 text-right">{num(it.unit_rate)}</td>}
              <td className="px-2 py-2 text-right font-semibold">{num(it.amount ?? it.quantity * it.unit_rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ---------- Totals ---------- */}
      <div className="relative mt-3 flex justify-end">
        <table className="w-72">
          <tbody>
            {totals.map((x) => (
              <tr
                key={x.k}
                className={x.bold ? "text-base font-black" : ""}
                style={x.bold ? (minimal ? { borderTop: `2px solid ${t.primary}` } : { background: t.primary, color: "#ffffff" }) : undefined}
              >
                <td className="px-2 py-1">{x.k}</td>
                <td className="px-2 py-1 text-right">{x.bold ? <Omr v={x.v} /> : num(x.v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="relative mt-1 text-right text-xs text-slate-500">
        All amounts in Omani Rial (<OmrSign />)
      </p>

      {footer}

      {/* ---------- Bank details ---------- */}
      {hasBank && (
        <section className="relative mt-5 rounded-lg border p-3" style={{ borderColor: `${t.primary}33` }}>
          <p className="text-xs font-bold uppercase" style={{ color: t.accent }}>Bank details</p>
          <div className="mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5">
            {t.bank.name && <p><span className="text-slate-500">Bank:</span> <b>{t.bank.name}</b></p>}
            {t.bank.holder && <p><span className="text-slate-500">Account name:</span> <b>{t.bank.holder}</b></p>}
            {t.bank.account && <p><span className="text-slate-500">Account no:</span> <b>{t.bank.account}</b></p>}
            {t.bank.iban && <p><span className="text-slate-500">IBAN:</span> <b>{t.bank.iban}</b></p>}
          </div>
        </section>
      )}

      {s.notes && notes && (
        <section className="relative mt-5">
          <p className="text-xs font-bold uppercase" style={{ color: minimal ? "#64748b" : t.accent }}>Notes</p>
          <p className="whitespace-pre-wrap">{notes}</p>
        </section>
      )}
      {s.terms && terms && (
        <section className="relative mt-4">
          <p className="text-xs font-bold uppercase" style={{ color: minimal ? "#64748b" : t.accent }}>Terms &amp; Conditions</p>
          <p className="whitespace-pre-wrap">{terms}</p>
        </section>
      )}

      {/* ---------- Signatures ---------- */}
      {s.signatures && (
        <section className="relative mt-10 grid grid-cols-2 gap-10 text-center">
          <div>
            <div className="flex h-20 items-end justify-center gap-2">
              {t.signature_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.signature_url} alt="" crossOrigin={cors(t.signature_url)} className="max-h-16 max-w-[140px] object-contain" />
              )}
              {t.stamp_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.stamp_url} alt="" crossOrigin={cors(t.stamp_url)} className="max-h-20 max-w-[100px] -rotate-6 object-contain opacity-90" />
              )}
            </div>
            <div className="border-t border-slate-400 pt-1">{signLeft}</div>
          </div>
          <div>
            <div className="h-20" />
            <div className="border-t border-slate-400 pt-1">{t.sign_right}</div>
          </div>
        </section>
      )}

      {t.footer_text && (
        <footer
          className="relative mt-8 rounded-md px-3 py-2 text-center text-xs"
          style={minimal ? { color: "#64748b", borderTop: "1px solid #e2e8f0" } : { background: `${t.primary}0d`, color: t.primary }}
        >
          <span className="whitespace-pre-wrap">{t.footer_text}</span>
        </footer>
      )}
    </div>
  );
}
