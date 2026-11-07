"use client";
import Omr, { OmrSign } from "@/components/Omr";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/lib/useCompany";
import { date, label, num } from "@/lib/format";
import Badge from "@/components/Badge";
import History from "@/components/History";
import Explain, { Calc } from "@/components/Explain";
import ShareButton from "@/components/ShareButton";
import Attachments from "@/components/Attachments";
import { useMe } from "@/components/AuthGate";
import type { Invoice, Item, Payment } from "@/lib/types";

const today = () => new Date().toISOString().slice(0, 10);

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const { company } = useCompany();
  const { isGuest } = useMe();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [pays, setPays] = useState<Payment[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pf, setPf] = useState({ amount: "", paid_on: today(), method: "bank", reference: "" });
  const [ver, setVer] = useState(0);

  const load = useCallback(async () => {
    const [{ data: i }, { data: it }, { data: p }] = await Promise.all([
      supabase.from("invoices").select("*, clients(*), quotations(code, project_name, project_code, location, attention_to, mobile, total)").eq("id", id).single(),
      supabase.from("invoice_items").select("*").eq("invoice_id", id).order("sort_order"),
      supabase.from("payments").select("*").eq("invoice_id", id).order("paid_on"),
    ]);
    setInv(i as Invoice);
    setItems((it as Item[]) || []);
    setPays((p as Payment[]) || []);
    setVer((v) => v + 1);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const issue = async () => {
    setErr(null);
    setBusy(true);
    const { error } = await supabase.rpc("issue_invoice", { p_invoice_id: id });
    setBusy(false);
    if (error) setErr(error.message);
    else load();
  };

  const cancelDraft = async () => {
    if (!confirm("Cancel this draft invoice? The amount goes back to the quotation's remaining balance.")) return;
    const { error } = await supabase.from("invoices").update({ status: "cancelled" }).eq("id", id);
    if (error) setErr(error.message);
    else load();
  };

  const setDue = async (d: string) => {
    await supabase.from("invoices").update({ due_date: d || null }).eq("id", id);
    load();
  };

  const addPayment = async () => {
    setErr(null);
    const amt = Number(pf.amount);
    if (!inv || amt <= 0) return setErr("Enter a payment amount.");
    if (amt > Number(inv.balance) + 0.0005) return setErr(`Payment is more than the balance (${num(inv.balance)}).`);
    setBusy(true);
    const { error } = await supabase.from("payments").insert({
      company_id: inv.company_id,
      invoice_id: inv.id,
      amount: amt,
      paid_on: pf.paid_on,
      method: pf.method,
      reference: pf.reference || null,
    });
    setBusy(false);
    if (error) setErr(error.message);
    else {
      setPf({ amount: "", paid_on: today(), method: "bank", reference: "" });
      load();
    }
  };

  const removePayment = async (pid: string) => {
    if (!confirm("Delete this payment?")) return;
    await supabase.from("payments").delete().eq("id", pid);
    load();
  };

  if (!company || !inv) return <p className="text-slate-500">Loading...</p>;
  const isDraft = inv.status === "draft";
  const canEdit = isDraft && !isGuest;
  const canPay = !isGuest && (inv.status === "issued" || inv.status === "partially_paid");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/invoices" className="text-sm text-slate-500">← Invoices</Link>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Invoice {inv.code}</h1>
            <Badge status={inv.status} />
          </div>
          <p className="text-sm text-slate-500">
            {label(inv.kind)} · {inv.clients?.name} ·{" "}
            {inv.quotation_id && (
              <Link className="underline" href={`/quotations/${inv.quotation_id}`}>
                {inv.quotations?.code}
              </Link>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ShareButton
            token={inv.share_token}
            title={`Invoice ${inv.code}`}
            clientName={inv.clients?.name}
            total={inv.total}
            mobile={inv.quotations?.mobile}
            disabledReason={isDraft ? "Issue the invoice first. Draft invoices cannot be shared." : undefined}
          />
          <Link href={`/invoices/${id}/print`} target="_blank" className="btn-light">Print / PDF</Link>
          {canEdit && (
            <>
              <button className="btn-primary" disabled={busy} onClick={issue}>Issue invoice</button>
              <button className="btn-light text-red-600" onClick={cancelDraft}>Cancel draft</button>
            </>
          )}
        </div>
      </div>

      {isDraft && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Draft. Once issued, this invoice is locked and cannot be edited (as required for e-invoicing). Corrections are made with a credit note.
        </div>
      )}
      {err && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>}

      <Explain title="How this invoice is calculated">
        <Calc label="Subtotal" formula="sum of line amounts" result={num(inv.subtotal)} />
        <Calc label={`VAT ${Number(inv.vat_rate)}%`} formula={`${num(inv.subtotal)} × ${Number(inv.vat_rate)}%`} result={num(inv.vat_amount)} />
        <Calc label="Total" formula={`${num(inv.subtotal)} + ${num(inv.vat_amount)}`} result={num(inv.total)} />
        <Calc label="Balance" formula={`${num(inv.total)} − ${num(inv.amount_paid)} received`} result={num(inv.balance)} />
        <p className="pt-1">Status changes by itself: Issued → Partially paid (some money received) → Paid (balance zero).</p>
      </Explain>

      <div className="grid gap-4 md:grid-cols-3">
        <Box k="Total" v={<Omr v={inv.total} />} />
        <Box k="Received" v={<Omr v={inv.amount_paid} />} tone="text-emerald-700" />
        <Box k="Balance" v={<Omr v={inv.balance} />} tone={Number(inv.balance) > 0 ? "text-red-600" : "text-slate-400"} />
      </div>

      <div className="card grid gap-3 p-4 text-sm sm:grid-cols-2">
        <Info k="Company" v={inv.clients?.name} />
        <Info k="Project" v={[inv.quotations?.project_name, inv.quotations?.project_code].filter(Boolean).join(" · ")} />
        <Info k="Location" v={inv.quotations?.location} />
        <Info k="Kind attention" v={inv.quotations?.attention_to} />
        <Info k="Invoice date" v={date(inv.issue_date)} />
        <div>
          <span className="lbl">Due date</span>
          {canEdit ? (
            <input key={ver} className="input" type="date" defaultValue={inv.due_date || ""} onBlur={(e) => setDue(e.target.value)} />
          ) : (
            <span className="font-medium">{date(inv.due_date) || "-"}</span>
          )}
        </div>
        {inv.issued_at && <Info k="Issued at" v={date(inv.issued_at)} />}
        {company.vat_registered && <Info k="E-invoice (Fawtara)" v={label(inv.einvoice_status)} />}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[520px]">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">#</th>
              <th className="th">Description</th>
              <th className="th text-right">Qty</th>
              <th className="th text-right">Rate</th>
              <th className="th text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id} className="border-t border-slate-100">
                <td className="td">{i + 1}</td>
                <td className="td">{it.description}</td>
                <td className="td text-right">{it.unit === "ls" ? "LS" : `${Number(it.quantity)} ${it.unit}`}</td>
                <td className="td text-right">{num(it.unit_rate)}</td>
                <td className="td text-right font-semibold">{num(it.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="text-sm">
            <tr className="border-t border-slate-200">
              <td className="td text-right" colSpan={4}>Subtotal</td>
              <td className="td text-right">{num(inv.subtotal)}</td>
            </tr>
            <tr>
              <td className="td text-right" colSpan={4}>VAT {Number(inv.vat_rate)}%</td>
              <td className="td text-right">{num(inv.vat_amount)}</td>
            </tr>
            <tr className="font-black">
              <td className="td text-right" colSpan={4}>Total</td>
              <td className="td text-right">{num(inv.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {!isDraft && (
        <div className="card space-y-3 p-4">
          <h3 className="font-bold">Payments</h3>
          <Explain>
            <p>Record each payment when it arrives (full or part). The app adds them up and reduces the balance. You cannot record more than the balance.</p>
          </Explain>
          {pays.length === 0 && <p className="text-sm text-slate-500">No payments yet.</p>}
          {pays.map((p) => (
            <div key={p.id} className="flex items-center justify-between border-t border-slate-100 pt-2 text-sm">
              <div>
                <b><Omr v={p.amount} /></b> · {date(p.paid_on)} · {label(p.method || "")} {p.reference && `· ${p.reference}`}
              </div>
              {!isGuest && <button className="text-xs text-red-600" onClick={() => removePayment(p.id)}>Delete</button>}
            </div>
          ))}
          {canPay && (
            <div className="grid gap-2 border-t border-slate-200 pt-3 sm:grid-cols-5">
              <input
                className="input"
                type="number"
                step="any"
                inputMode="decimal"
                placeholder={`Amount (max ${num(inv.balance)})`}
                value={pf.amount}
                onChange={(e) => setPf({ ...pf, amount: e.target.value })}
              />
              <input className="input" type="date" value={pf.paid_on} onChange={(e) => setPf({ ...pf, paid_on: e.target.value })} />
              <select className="input" value={pf.method} onChange={(e) => setPf({ ...pf, method: e.target.value })}>
                <option value="bank">Bank transfer</option>
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
                <option value="card">Card</option>
              </select>
              <input className="input" placeholder="Reference" value={pf.reference} onChange={(e) => setPf({ ...pf, reference: e.target.value })} />
              <button className="btn-accent" disabled={busy} onClick={addPayment}>Record payment</button>
            </div>
          )}
        </div>
      )}

      <Attachments companyId={inv.company_id} invoiceId={inv.id} />

      <History recordId={inv.id} parentKey="invoice_id" />
    </div>
  );
}

function Box({ k, v, tone = "" }: { k: string; v: React.ReactNode; tone?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase text-slate-500">{k}</p>
      <p className={`text-xl font-bold ${tone}`}>{v}</p>
    </div>
  );
}

function Info({ k, v }: { k: string; v?: string | null }) {
  return (
    <div>
      <span className="lbl">{k}</span>
      <span className="font-medium">{v || "-"}</span>
    </div>
  );
}
