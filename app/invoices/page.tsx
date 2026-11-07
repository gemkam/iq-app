"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/lib/useCompany";
import { date, label, money, num } from "@/lib/format";
import Badge from "@/components/Badge";
import type { Invoice } from "@/lib/types";

const FILTERS = ["all", "draft", "issued", "partially_paid", "paid", "cancelled"];

export default function Invoices() {
  const { company } = useCompany();
  const [rows, setRows] = useState<Invoice[]>([]);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!company) return;
    let query = supabase
      .from("invoices")
      .select("*, clients(name), quotations(code, project_name)")
      .eq("company_id", company.id)
      .order("base_no", { ascending: false })
      .order("seq", { ascending: true });
    if (filter !== "all") query = query.eq("status", filter);
    query.then(({ data }) => {
      setRows((data as Invoice[]) || []);
      setLoading(false);
    });
  }, [company, filter]);

  const shown = rows.filter((r) =>
    `${r.code} ${r.clients?.name || ""} ${r.quotations?.project_name || ""} ${r.quotations?.code || ""}`.toLowerCase().includes(q.toLowerCase())
  );
  const outstanding = shown.filter((r) => r.status === "issued" || r.status === "partially_paid").reduce((s, r) => s + Number(r.balance), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Invoices</h1>
        <div className="text-right">
          <div className="text-xs text-slate-500">Outstanding (shown)</div>
          <div className="text-lg font-bold text-red-600">{money(outstanding)}</div>
        </div>
      </div>
      <p className="text-sm text-slate-500">Invoices are created from a quotation using Convert to Invoice.</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input className="input sm:max-w-xs" placeholder="Search number, company, project..." value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex gap-1 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${filter === f ? "bg-slate-800 text-white" : "bg-white border border-slate-200"}`}
            >
              {label(f)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {loading && <p className="text-slate-500">Loading...</p>}
        {!loading && shown.length === 0 && <div className="card p-6 text-center text-slate-500">No invoices yet.</div>}
        {shown.map((r) => (
          <Link key={r.id} href={`/invoices/${r.id}`} className="card flex flex-wrap items-center justify-between gap-3 p-4 hover:shadow-md">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold">{r.code}</span>
                <span className="text-xs text-slate-500">{label(r.kind)}</span>
                <Badge status={r.status} />
              </div>
              <p className="truncate font-medium">{r.clients?.name || "No company"}</p>
              <p className="truncate text-sm text-slate-500">
                {r.quotations?.code} {r.quotations?.project_name ? `· ${r.quotations.project_name}` : ""} · {date(r.issue_date)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold">{money(r.total)}</p>
              {Number(r.balance) > 0 && r.status !== "draft" && <p className="text-sm text-red-600">Balance {num(r.balance)}</p>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
