"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/lib/useCompany";
import { money } from "@/lib/format";
import Explain from "@/components/Explain";
import { useMe } from "@/components/AuthGate";

type Summary = {
  quotations_submitted: number;
  quotations_value: number;
  quotations_approved: number;
  approved_value: number;
  invoices_issued: number;
  invoiced_value: number;
  receivable: number;
};
type Rec = { client_id: string | null; client_name: string | null; open_invoices: number; invoiced: number; received: number; balance: number };

export default function Dashboard() {
  const { company, error } = useCompany();
  const { isGuest } = useMe();
  const [s, setS] = useState<Summary | null>(null);
  const [rec, setRec] = useState<Rec[]>([]);
  const [counts, setCounts] = useState({ q: 0, i: 0 });

  useEffect(() => {
    if (!company) return;
    const id = company.id;
    supabase.from("report_summary").select("*").eq("company_id", id).single().then(({ data }) => setS(data as Summary));
    supabase
      .from("report_receivables")
      .select("*")
      .eq("company_id", id)
      .order("balance", { ascending: false })
      .then(({ data }) => setRec((data as Rec[]) || []));
    Promise.all([
      supabase.from("quotations").select("id", { count: "exact", head: true }).eq("company_id", id),
      supabase.from("invoices").select("id", { count: "exact", head: true }).eq("company_id", id),
    ]).then(([q, i]) => setCounts({ q: q.count || 0, i: i.count || 0 }));
  }, [company]);

  if (error) return <p className="text-red-600">Could not load: {error}</p>;
  if (!company) return <p className="text-slate-500">Loading...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{company.name}</h1>
        <p className="text-sm text-slate-500">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/quotations" className="card group p-6 transition hover:shadow-md">
          <p className="text-sm font-semibold text-slate-500">QUOTATIONS</p>
          <p className="mt-1 text-4xl font-black" style={{ color: "var(--brand)" }}>{counts.q}</p>
          <p className="mt-1 text-sm text-slate-500">All quotations</p>
          <span className="btn-primary mt-4">Open quotations</span>
        </Link>
        <Link href="/invoices" className="card group p-6 transition hover:shadow-md">
          <p className="text-sm font-semibold text-slate-500">INVOICES</p>
          <p className="mt-1 text-4xl font-black" style={{ color: "var(--accent)" }}>{counts.i}</p>
          <p className="mt-1 text-sm text-slate-500">All invoices</p>
          <span className="btn-accent mt-4">Open invoices</span>
        </Link>
      </div>

      <Explain title="How the app flows">
        <p>1. Create a <b>Quotation</b> for a client (items, quantities, rates, discount, VAT).</p>
        <p>2. Mark it <b>Submitted</b> when sent, then <b>Approved</b> or <b>Rejected</b> when the client replies.</p>
        <p>3. Use <b>Convert to Invoice</b> to bill the full amount, or bill in parts (advance, milestones, final).</p>
        <p>4. <b>Issue</b> the invoice, then <b>Record payment</b> when money comes in. The balance updates by itself.</p>
        <p>5. This dashboard shows totals and who still owes money.</p>
      </Explain>

      {!isGuest && <Link href="/quotations/new" className="btn-primary w-full py-3 text-base sm:w-auto">+ New Quotation</Link>}

      <section>
        <h2 className="mb-3 text-lg font-bold">Reports</h2>
        <Explain title="What these numbers mean" className="mb-3">
          <p><b>Quotations submitted:</b> every quotation that is not a draft (submitted, approved, rejected or converted), and their total value incl. VAT.</p>
          <p><b>Approved:</b> quotations the client accepted (approved + converted to invoice).</p>
          <p><b>Invoices issued:</b> invoices sent to clients (drafts and cancelled ones are not counted).</p>
          <p><b>Receivable</b> = total of issued invoices − payments received. This is the money still to collect.</p>
        </Explain>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat title="Quotations submitted" value={String(s?.quotations_submitted ?? 0)} sub={money(s?.quotations_value)} />
          <Stat title="Approved" value={String(s?.quotations_approved ?? 0)} sub={money(s?.approved_value)} />
          <Stat title="Invoices issued" value={String(s?.invoices_issued ?? 0)} sub={money(s?.invoiced_value)} />
          <Stat title="Receivable" value={money(s?.receivable)} sub="Still to collect" highlight />
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3 font-bold">Receivables by company</div>
        <Explain className="m-3">
          <p>For each client: <b>Invoiced</b> (all issued invoices incl. VAT) − <b>Received</b> (payments recorded) = <b>Balance</b> still owed.</p>
        </Explain>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Company</th>
                <th className="th text-right">Invoiced</th>
                <th className="th text-right">Received</th>
                <th className="th text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rec.length === 0 && (
                <tr>
                  <td className="td text-slate-500" colSpan={4}>No issued invoices yet.</td>
                </tr>
              )}
              {rec.map((r) => (
                <tr key={r.client_id || "none"} className="border-t border-slate-100">
                  <td className="td font-medium">{r.client_name || "No client"}</td>
                  <td className="td text-right">{money(r.invoiced)}</td>
                  <td className="td text-right text-emerald-700">{money(r.received)}</td>
                  <td className={`td text-right font-bold ${r.balance > 0 ? "text-red-600" : "text-slate-400"}`}>{money(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ title, value, sub, highlight }: { title: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div className={`card p-4 ${highlight ? "border-red-200 bg-red-50" : ""}`}>
      <p className="text-xs font-semibold uppercase text-slate-500">{title}</p>
      <p className={`mt-1 text-xl font-bold ${highlight ? "text-red-700" : ""}`}>{value}</p>
      <p className="text-xs text-slate-500">{sub}</p>
    </div>
  );
}
