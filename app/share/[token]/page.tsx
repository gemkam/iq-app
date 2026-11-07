"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { date, label, num } from "@/lib/format";
import { DEFAULT_UNITS } from "@/lib/units";
import PrintDoc from "@/components/PrintDoc";
import type { Company, Item } from "@/lib/types";

type Shared = {
  type: "quotation" | "invoice";
  company: Company;
  doc: Record<string, unknown>;
  client: { name?: string; vatin?: string | null } | null;
  quotation?: { code?: string; project_name?: string; project_code?: string; location?: string; attention_to?: string; mobile?: string } | null;
  items: Item[];
};

const n = (v: unknown) => Number(v || 0);
const s = (v: unknown) => (v == null ? null : String(v));

export default function SharedDoc() {
  const { token } = useParams<{ token: string }>();
  const [d, setD] = useState<Shared | null>(null);
  const [state, setState] = useState<"loading" | "missing" | "ok">("loading");

  useEffect(() => {
    supabase.rpc("get_shared_document", { p_token: token }).then(({ data, error }) => {
      if (error || !data) setState("missing");
      else {
        setD(data as Shared);
        setState("ok");
      }
    });
  }, [token]);

  if (state === "loading") return <p className="p-6 text-slate-500">Loading...</p>;
  if (state === "missing" || !d) return <p className="p-6 text-center text-slate-600">This link is not valid or the document is not available.</p>;

  const doc = d.doc;
  if (d.type === "quotation") {
    const totals = [{ k: "Subtotal", v: n(doc.subtotal) }];
    if (n(doc.discount_amount) > 0) {
      totals.push({ k: `Discount${doc.discount_type === "percent" ? ` (${n(doc.discount_value)}%)` : ""}`, v: -n(doc.discount_amount) });
      totals.push({ k: "After discount", v: n(doc.subtotal) - n(doc.discount_amount) });
    }
    if (n(doc.vat_rate) > 0) totals.push({ k: `VAT ${n(doc.vat_rate)}%`, v: n(doc.vat_amount) });
    return (
      <PrintDoc
        shared
        company={d.company}
        title="QUOTATION"
        number={String(doc.code)}
        docDate={String(doc.quote_date)}
        billTo={{ name: d.client?.name, attention: s(doc.attention_to), mobile: s(doc.mobile), vatin: d.client?.vatin }}
        meta={[
          { k: "Project", v: s(doc.project_name) },
          { k: "Project code", v: s(doc.project_code) },
          { k: "Location", v: s(doc.location) },
          { k: "Valid for", v: `${n(doc.validity_days)} days` },
        ]}
        items={d.items}
        units={DEFAULT_UNITS}
        totals={[...totals, { k: "TOTAL", v: n(doc.total), bold: true }]}
        notes={s(doc.notes)}
        terms={s(doc.terms)}
      />
    );
  }

  const totals = [{ k: "Subtotal", v: n(doc.subtotal) }];
  if (n(doc.vat_rate) > 0) totals.push({ k: `VAT ${n(doc.vat_rate)}%`, v: n(doc.vat_amount) });
  const title = d.company.vat_registered && n(doc.vat_rate) > 0 ? "TAX INVOICE" : "INVOICE";
  return (
    <PrintDoc
      shared
      company={d.company}
      title={title}
      number={String(doc.code)}
      docDate={String(doc.issue_date)}
      billTo={{ name: d.client?.name, attention: d.quotation?.attention_to, mobile: d.quotation?.mobile, vatin: d.client?.vatin }}
      meta={[
        { k: "Invoice type", v: label(String(doc.kind)) },
        { k: "Quotation ref", v: d.quotation?.code },
        { k: "Project", v: d.quotation?.project_name },
        { k: "Location", v: d.quotation?.location },
        { k: "Due date", v: date(s(doc.due_date)) },
      ]}
      items={d.items}
      units={DEFAULT_UNITS}
      totals={[...totals, { k: "TOTAL", v: n(doc.total), bold: true }]}
      footer={
        n(doc.amount_paid) > 0 ? (
          <div className="mt-3 flex justify-end">
            <table className="w-72 text-sm">
              <tbody>
                <tr>
                  <td className="px-2 py-1">Received</td>
                  <td className="px-2 py-1 text-right">{num(n(doc.amount_paid))}</td>
                </tr>
                <tr className="font-bold">
                  <td className="px-2 py-1">Balance due</td>
                  <td className="px-2 py-1 text-right">{num(n(doc.balance))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : null
      }
    />
  );
}
