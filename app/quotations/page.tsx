"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/lib/useCompany";
import { date, money } from "@/lib/format";
import Badge from "@/components/Badge";
import Explain from "@/components/Explain";
import { useMe } from "@/components/AuthGate";
import type { Quotation } from "@/lib/types";

const FILTERS = ["all", "draft", "submitted", "approved", "converted", "rejected"];

export default function Quotations() {
  const { company } = useCompany();
  const { isGuest } = useMe();
  const [rows, setRows] = useState<Quotation[]>([]);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!company) return;
    let query = supabase
      .from("quotations")
      .select("*, clients(name)")
      .eq("company_id", company.id)
      .order("number", { ascending: false });
    if (filter !== "all") query = query.eq("status", filter);
    query.then(({ data }) => {
      setRows((data as Quotation[]) || []);
      setLoading(false);
    });
  }, [company, filter]);

  const shown = rows.filter((r) => {
    const t = `${r.code} ${r.clients?.name || ""} ${r.project_name || ""} ${r.project_code || ""}`.toLowerCase();
    return t.includes(q.toLowerCase());
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Quotations</h1>
        {!isGuest && <Link href="/quotations/new" className="btn-primary">+ New Quotation</Link>}
      </div>
      <Explain title="Quotation statuses">
        <p><b>Draft:</b> still being prepared. <b>Submitted:</b> sent to the client. <b>Approved / Rejected:</b> the client&apos;s answer.</p>
        <p><b>Converted:</b> an invoice was made from it, so it is locked. Numbers go Q-1001, Q-1002 and so on automatically.</p>
      </Explain>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input className="input sm:max-w-xs" placeholder="Search company, project, code..." value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex gap-1 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm capitalize ${filter === f ? "bg-slate-800 text-white" : "bg-white border border-slate-200"}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {loading && <p className="text-slate-500">Loading...</p>}
        {!loading && shown.length === 0 && <div className="card p-6 text-center text-slate-500">No quotations yet.</div>}
        {shown.map((r) => (
          <Link key={r.id} href={`/quotations/${r.id}`} className="card flex flex-wrap items-center justify-between gap-3 p-4 hover:shadow-md">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold">{r.code}</span>
                <Badge status={r.status} />
              </div>
              <p className="truncate font-medium">{r.clients?.name || "No company"}</p>
              <p className="truncate text-sm text-slate-500">
                {r.project_name || "-"} {r.project_code ? `(${r.project_code})` : ""} · {date(r.quote_date)}
              </p>
            </div>
            <p className="text-lg font-bold">{money(r.total)}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
