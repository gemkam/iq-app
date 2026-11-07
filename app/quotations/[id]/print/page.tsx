"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/lib/useCompany";
import PrintDoc from "@/components/PrintDoc";
import type { Item, Quotation, Unit } from "@/lib/types";

export default function PrintQuotation() {
  const { id } = useParams<{ id: string }>();
  const { company } = useCompany();
  const [q, setQ] = useState<Quotation | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);

  useEffect(() => {
    supabase.from("quotations").select("*, clients(*)").eq("id", id).single().then(({ data }) => setQ(data as Quotation));
    supabase.from("quotation_items").select("*").eq("quotation_id", id).order("sort_order").then(({ data }) => setItems((data as Item[]) || []));
    supabase.from("units").select("*").then(({ data }) => setUnits((data as Unit[]) || []));
  }, [id]);

  if (!company || !q) return <p className="p-6 text-slate-500">Loading...</p>;

  const totals = [{ k: "Subtotal", v: Number(q.subtotal) }];
  if (Number(q.discount_amount) > 0) {
    totals.push({ k: `Discount${q.discount_type === "percent" ? ` (${Number(q.discount_value)}%)` : ""}`, v: -Number(q.discount_amount) });
    totals.push({ k: "After discount", v: Number(q.subtotal) - Number(q.discount_amount) });
  }
  if (Number(q.vat_rate) > 0) totals.push({ k: `VAT ${Number(q.vat_rate)}%`, v: Number(q.vat_amount) });

  return (
    <PrintDoc
      company={company}
      title="QUOTATION"
      number={q.code}
      docDate={q.quote_date}
      billTo={{ name: q.clients?.name, attention: q.attention_to, mobile: q.mobile, vatin: q.clients?.vatin }}
      meta={[
        { k: "Project", v: q.project_name },
        { k: "Project code", v: q.project_code },
        { k: "Location", v: q.location },
        { k: "Valid for", v: `${q.validity_days} days` },
      ]}
      items={items}
      units={units}
      totals={[...totals, { k: "TOTAL", v: Number(q.total), bold: true }]}
      notes={q.notes}
      terms={q.terms}
    />
  );
}
