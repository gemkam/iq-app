"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/lib/useCompany";
import { date, label, num } from "@/lib/format";
import PrintDoc from "@/components/PrintDoc";
import type { Invoice, Item, Payment, Unit } from "@/lib/types";

export default function PrintInvoice() {
  const { id } = useParams<{ id: string }>();
  const { company } = useCompany();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [pays, setPays] = useState<Payment[]>([]);

  useEffect(() => {
    supabase
      .from("invoices")
      .select("*, clients(*), quotations(code, project_name, project_code, location, attention_to, mobile, total)")
      .eq("id", id)
      .single()
      .then(({ data }) => setInv(data as Invoice));
    supabase.from("invoice_items").select("*").eq("invoice_id", id).order("sort_order").then(({ data }) => setItems((data as Item[]) || []));
    supabase.from("units").select("*").then(({ data }) => setUnits((data as Unit[]) || []));
    supabase.from("payments").select("*").eq("invoice_id", id).order("paid_on").then(({ data }) => setPays((data as Payment[]) || []));
  }, [id]);

  if (!company || !inv) return <p className="p-6 text-slate-500">Loading...</p>;

  const title = inv.status === "draft" ? "DRAFT INVOICE" : company.vat_registered && Number(inv.vat_rate) > 0 ? "TAX INVOICE" : "INVOICE";
  const totals = [{ k: "Subtotal", v: Number(inv.subtotal) }];
  if (Number(inv.vat_rate) > 0) totals.push({ k: `VAT ${Number(inv.vat_rate)}%`, v: Number(inv.vat_amount) });
  totals.push({ k: "TOTAL", v: Number(inv.total) });

  return (
    <PrintDoc
      company={company}
      title={title}
      number={inv.code}
      docDate={inv.issue_date}
      billTo={{ name: inv.clients?.name, attention: inv.quotations?.attention_to, mobile: inv.quotations?.mobile, vatin: inv.clients?.vatin }}
      meta={[
        { k: "Invoice type", v: label(inv.kind) },
        { k: "Quotation ref", v: inv.quotations?.code },
        { k: "Project", v: inv.quotations?.project_name },
        { k: "Project code", v: inv.quotations?.project_code },
        { k: "Location", v: inv.quotations?.location },
        { k: "Due date", v: date(inv.due_date) },
      ]}
      items={items}
      units={units}
      totals={totals.map((t) => ({ ...t, bold: t.k === "TOTAL" }))}
      footer={
        pays.length > 0 ? (
          <div className="mt-3 flex justify-end">
            <table className="w-72 text-sm">
              <tbody>
                <tr>
                  <td className="px-2 py-1">Received</td>
                  <td className="px-2 py-1 text-right">{num(inv.amount_paid)}</td>
                </tr>
                <tr className="font-bold">
                  <td className="px-2 py-1">Balance due</td>
                  <td className="px-2 py-1 text-right">{num(inv.balance)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : null
      }
    />
  );
}
