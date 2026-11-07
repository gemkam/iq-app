"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/lib/useCompany";
import { date, label, money, num, round3 } from "@/lib/format";
import Badge from "@/components/Badge";
import History from "@/components/History";
import QuotationForm from "@/components/QuotationForm";
import type { Invoice, Item, Quotation } from "@/lib/types";

export default function QuotationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { company } = useCompany();
  const [q, setQ] = useState<Quotation | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [ver, setVer] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: qd }, { data: it }, { data: inv }] = await Promise.all([
      supabase.from("quotations").select("*, clients(*)").eq("id", id).single(),
      supabase.from("quotation_items").select("*").eq("quotation_id", id).order("sort_order"),
      supabase.from("invoices").select("*").eq("quotation_id", id).order("seq"),
    ]);
    setQ(qd as Quotation);
    setItems((it as Item[]) || []);
    setInvoices((inv as Invoice[]) || []);
    setVer((v) => v + 1);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (status: string) => {
    const { error } = await supabase.from("quotations").update({ status }).eq("id", id);
    if (error) setMsg(error.message);
    else load();
  };

  if (!company || !q) return <p className="text-slate-500">Loading...</p>;

  const net = round3(q.subtotal - q.discount_amount);
  const invoicedNet = round3(invoices.filter((i) => i.doc_type === "invoice" && i.status !== "cancelled").reduce((s, i) => s + Number(i.subtotal), 0));
  const remaining = round3(net - invoicedNet);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/quotations" className="text-sm text-slate-500 no-print">← Quotations</Link>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{q.code}</h1>
            <Badge status={q.status} />
          </div>
          <p className="text-sm text-slate-500">
            {q.clients?.name} · {date(q.quote_date)} · {money(q.total)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/quotations/${id}/print`} target="_blank" className="btn-light">Print / PDF</Link>
          {q.status === "draft" && <button className="btn-light" onClick={() => setStatus("submitted")}>Mark submitted</button>}
          {(q.status === "draft" || q.status === "submitted") && (
            <>
              <button className="btn-light text-emerald-700" onClick={() => setStatus("approved")}>Mark approved</button>
              <button className="btn-light text-red-600" onClick={() => setStatus("rejected")}>Mark rejected</button>
            </>
          )}
          {q.status === "rejected" && <button className="btn-light" onClick={() => setStatus("submitted")}>Reopen</button>}
        </div>
      </div>
      {msg && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{msg}</p>}

      <QuotationForm key={ver} company={company} quotation={q} initialItems={items} onSaved={load} />

      {q.status !== "rejected" && (
        <ConvertPanel
          quotationId={q.id}
          net={net}
          invoicedNet={invoicedNet}
          remaining={remaining}
          vatRate={Number(q.vat_rate)}
          hasInvoices={invoices.length > 0}
          onDone={(invId) => router.push(`/invoices/${invId}`)}
        />
      )}

      {invoices.length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3 font-bold">Invoices for this quotation</div>
          {invoices.map((i) => (
            <Link key={i.id} href={`/invoices/${i.id}`} className="flex items-center justify-between border-t border-slate-100 px-4 py-3 hover:bg-slate-50">
              <div>
                <span className="font-bold">{i.code}</span> <span className="text-sm text-slate-500">{label(i.kind)}</span>{" "}
                <Badge status={i.status} />
              </div>
              <div className="text-right text-sm">
                <div className="font-bold">{money(i.total)}</div>
                <div className="text-slate-500">Balance {num(i.balance)}</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <History recordId={q.id} parentKey="quotation_id" />
    </div>
  );
}

function ConvertPanel({
  quotationId,
  net,
  invoicedNet,
  remaining,
  vatRate,
  hasInvoices,
  onDone,
}: {
  quotationId: string;
  net: number;
  invoicedNet: number;
  remaining: number;
  vatRate: number;
  hasInvoices: boolean;
  onDone: (id: string) => void;
}) {
  const [mode, setMode] = useState<"full" | "part">(hasInvoices ? "part" : "full");
  const [amount, setAmount] = useState<string>("");
  const [kind, setKind] = useState(hasInvoices ? "milestone" : "advance");
  const [due, setDue] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (remaining <= 0) {
    return <div className="card p-4 text-sm text-emerald-700">Fully invoiced. Nothing left to invoice on this quotation.</div>;
  }

  const amt = mode === "full" ? remaining : Number(amount) || 0;

  const go = async () => {
    setErr(null);
    if (mode === "part" && (amt <= 0 || amt > remaining + 0.0005)) return setErr(`Enter an amount between 0 and ${num(remaining)}.`);
    setBusy(true);
    const { data, error } = await supabase.rpc("convert_quotation_to_invoice", {
      p_quotation_id: quotationId,
      p_amount: mode === "full" ? null : amt,
      p_kind: mode === "full" ? (hasInvoices ? "final" : "standard") : kind,
      p_description: desc || null,
      p_due_date: due || null,
    });
    setBusy(false);
    if (error) setErr(error.message);
    else onDone(data as string);
  };

  return (
    <div className="card space-y-3 border-2 p-4" style={{ borderColor: "var(--accent)" }}>
      <h3 className="text-lg font-bold">Convert to Invoice</h3>
      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div className="rounded-lg bg-slate-50 p-2">
          <div className="text-xs text-slate-500">Quotation (before VAT)</div>
          <div className="font-bold">{num(net)}</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-2">
          <div className="text-xs text-slate-500">Already invoiced</div>
          <div className="font-bold">{num(invoicedNet)}</div>
        </div>
        <div className="rounded-lg bg-amber-50 p-2">
          <div className="text-xs text-slate-500">Remaining</div>
          <div className="font-bold">{num(remaining)}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === "full"} onChange={() => setMode("full")} /> {hasInvoices ? "Invoice the remaining balance" : "Full amount"}
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === "part"} onChange={() => setMode("part")} /> Part amount (advance / milestone)
        </label>
      </div>
      {mode === "part" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="lbl">Amount (before VAT)</label>
            <input className="input" type="number" step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="lbl">Type</label>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="advance">Advance</option>
              <option value="milestone">Milestone / installment</option>
              <option value="final">Final</option>
            </select>
          </div>
          <div>
            <label className="lbl">Due date</label>
            <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div className="sm:col-span-3">
            <label className="lbl">Description (optional)</label>
            <input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. 25% advance to start work" />
          </div>
        </div>
      )}
      <p className="text-sm text-slate-600">
        Invoice amount: <b>{num(amt)}</b> + VAT {vatRate}% <b>{num(round3((amt * vatRate) / 100))}</b> ={" "}
        <b>{num(round3(amt + (amt * vatRate) / 100))}</b>
      </p>
      {err && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>}
      <button className="btn-accent" disabled={busy} onClick={go}>
        {busy ? "Creating..." : "Convert to Invoice"}
      </button>
    </div>
  );
}
