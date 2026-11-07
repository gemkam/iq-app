"use client";
import { date, num } from "@/lib/format";
import type { Company, Item, Unit } from "@/lib/types";

type Meta = { k: string; v: string | null | undefined };

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
}) {
  const unitLabel = (c: string) => units.find((u) => u.code === c)?.label || c;
  return (
    <div className="mx-auto max-w-[800px] bg-white p-6 text-[13px] text-slate-900 sm:p-10 print:p-0">
      <div className="no-print mb-6 flex gap-2">
        <button className="btn-primary" onClick={() => window.print()}>Print / Save as PDF</button>
        {!shared && <button className="btn-light" onClick={() => window.close()}>Close</button>}
      </div>

      <header className="flex items-start justify-between gap-6 border-b-4 pb-4" style={{ borderColor: "var(--brand)" }}>
        <div className="flex items-start gap-3">
          {company.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={company.logo_url} alt="" className="h-16 w-16 object-contain" />
          )}
          <div>
            <h1 className="text-xl font-black" style={{ color: "var(--brand)" }}>{company.name}</h1>
            {company.name_ar && <p dir="rtl" className="font-semibold">{company.name_ar}</p>}
            <p className="text-slate-600">{company.address}</p>
            <p className="text-slate-600">
              {[company.phone, company.email].filter(Boolean).join(" · ")}
            </p>
            <p className="text-slate-600">
              {company.cr_number && <>CR No: {company.cr_number}</>}
              {company.vatin && <> · VATIN: {company.vatin}</>}
            </p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-2xl font-black tracking-wide" style={{ color: "var(--accent)" }}>{title}</h2>
          <p className="font-bold">No: {number}</p>
          <p>Date: {date(docDate)}</p>
        </div>
      </header>

      <section className="mt-4 grid grid-cols-2 gap-6">
        <div>
          <p className="text-xs font-bold uppercase text-slate-500">To</p>
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

      <table className="mt-5 w-full border-collapse">
        <thead>
          <tr className="text-left text-white" style={{ background: "var(--brand)" }}>
            <th className="px-2 py-2 w-10">S.No</th>
            <th className="px-2 py-2">Description</th>
            <th className="px-2 py-2 text-right">Qty</th>
            <th className="px-2 py-2">Unit</th>
            <th className="px-2 py-2 text-right">Rate</th>
            <th className="px-2 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} className="border-b border-slate-200 align-top">
              <td className="px-2 py-2">{i + 1}</td>
              <td className="px-2 py-2 whitespace-pre-wrap">{it.description}</td>
              <td className="px-2 py-2 text-right">{it.unit === "ls" ? "1" : Number(it.quantity)}</td>
              <td className="px-2 py-2">{unitLabel(it.unit)}</td>
              <td className="px-2 py-2 text-right">{num(it.unit_rate)}</td>
              <td className="px-2 py-2 text-right font-semibold">{num(it.amount ?? it.quantity * it.unit_rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex justify-end">
        <table className="w-72">
          <tbody>
            {totals.map((t) => (
              <tr key={t.k} className={t.bold ? "border-t-2 border-slate-800 text-base font-black" : ""}>
                <td className="px-2 py-1">{t.k}</td>
                <td className="px-2 py-1 text-right">{num(t.v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-right text-xs text-slate-500">All amounts in {company.currency}</p>

      {footer}

      {notes && (
        <section className="mt-5">
          <p className="text-xs font-bold uppercase text-slate-500">Notes</p>
          <p className="whitespace-pre-wrap">{notes}</p>
        </section>
      )}
      {terms && (
        <section className="mt-4">
          <p className="text-xs font-bold uppercase text-slate-500">Terms &amp; Conditions</p>
          <p className="whitespace-pre-wrap">{terms}</p>
        </section>
      )}

      <section className="mt-14 grid grid-cols-2 gap-10 text-center">
        <div className="border-t border-slate-400 pt-1">For {company.name}</div>
        <div className="border-t border-slate-400 pt-1">Received / Accepted by</div>
      </section>
    </div>
  );
}
