"use client";
import Omr, { OmrSign } from "@/components/Omr";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/lib/useCompany";
import { date, num } from "@/lib/format";
import Explain from "@/components/Explain";
import { useMe } from "@/components/AuthGate";

type Q = { id: string; code: string; status: string; total: number; quote_date: string; created_at: string; clients: { name: string } | null };
type I = {
  id: string;
  code: string;
  status: string;
  doc_type: string;
  kind: string;
  total: number;
  amount_paid: number;
  balance: number;
  issue_date: string;
  due_date: string | null;
  created_at: string;
  client_id: string | null;
  clients: { name: string } | null;
};
type P = { amount: number; paid_on: string };

const LIVE = ["issued", "partially_paid", "paid"];
const OPEN = ["issued", "partially_paid"];
const sum = (a: number[]) => a.reduce((s, x) => s + Number(x || 0), 0);
const short = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `${(n / 1000).toFixed(1)}K` : num(n).replace(/\.000$/, "");

// Numbers that count up when the page opens
function useCountUp(target: number, ms = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function Counter({ value, money = true, className = "" }: { value: number; money?: boolean; className?: string }) {
  const v = useCountUp(value);
  return <span className={className}>{money ? num(v) : Math.round(v).toLocaleString("en-US")}</span>;
}

export default function Dashboard() {
  const { company, error } = useCompany();
  const { me, readOnly: isGuest } = useMe();
  const [qs, setQs] = useState<Q[]>([]);
  const [inv, setInv] = useState<I[]>([]);
  const [pays, setPays] = useState<P[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!company) return;
    const id = company.id;
    Promise.all([
      supabase.from("quotations").select("id, code, status, total, quote_date, created_at, clients(name)").eq("company_id", id),
      supabase
        .from("invoices")
        .select("id, code, status, doc_type, kind, total, amount_paid, balance, issue_date, due_date, created_at, client_id, clients(name)")
        .eq("company_id", id),
      supabase.from("payments").select("amount, paid_on").eq("company_id", id),
    ]).then(([q, i, p]) => {
      setQs((q.data as unknown as Q[]) || []);
      setInv((i.data as unknown as I[]) || []);
      setPays((p.data as P[]) || []);
      setLoaded(true);
    });
  }, [company]);

  const d = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const sent = qs.filter((q) => q.status !== "draft");
    const won = qs.filter((q) => q.status === "approved" || q.status === "converted");
    const lost = qs.filter((q) => q.status === "rejected");
    const live = inv.filter((i) => i.doc_type === "invoice" && LIVE.includes(i.status));
    const open = live.filter((i) => OPEN.includes(i.status));
    const overdue = open.filter((i) => i.due_date && i.due_date < today && Number(i.balance) > 0);

    // last 6 months: invoiced vs received
    const months: { key: string; label: string; invoiced: number; received: number }[] = [];
    const now = new Date();
    for (let k = 5; k >= 0; k--) {
      const m = new Date(now.getFullYear(), now.getMonth() - k, 1);
      months.push({
        key: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`,
        label: m.toLocaleDateString("en-GB", { month: "short" }),
        invoiced: 0,
        received: 0,
      });
    }
    live.forEach((i) => {
      const m = months.find((x) => x.key === i.issue_date.slice(0, 7));
      if (m) m.invoiced += Number(i.total);
    });
    pays.forEach((p) => {
      const m = months.find((x) => x.key === p.paid_on.slice(0, 7));
      if (m) m.received += Number(p.amount);
    });

    // receivables per client
    const byClient = new Map<string, { name: string; invoiced: number; received: number; balance: number }>();
    live.forEach((i) => {
      const k = i.client_id || "none";
      const r = byClient.get(k) || { name: i.clients?.name || "No client", invoiced: 0, received: 0, balance: 0 };
      r.invoiced += Number(i.total);
      r.received += Number(i.amount_paid);
      r.balance += Number(i.balance);
      byClient.set(k, r);
    });

    const stages = [
      { key: "draft", label: "Draft", color: "#64748b" },
      { key: "submitted", label: "Submitted", color: "#2563eb" },
      { key: "approved", label: "Approved", color: "#06b6d4" },
      { key: "converted", label: "Invoiced", color: "#8b5cf6" },
      { key: "rejected", label: "Rejected", color: "#e11d48" },
    ].map((s) => {
      const list = qs.filter((q) => q.status === s.key);
      return { ...s, count: list.length, value: sum(list.map((q) => q.total)) };
    });

    const recent = [
      ...qs.map((q) => ({ kind: "Quotation", id: q.id, href: `/quotations/${q.id}`, code: q.code, who: q.clients?.name, status: q.status, total: q.total, at: q.created_at })),
      ...inv.map((i) => ({ kind: "Invoice", id: i.id, href: `/invoices/${i.id}`, code: i.code, who: i.clients?.name, status: i.status, total: i.total, at: i.created_at })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 6);

    return {
      sentCount: sent.length,
      sentValue: sum(sent.map((q) => q.total)),
      wonCount: won.length,
      wonValue: sum(won.map((q) => q.total)),
      winRate: sent.length ? Math.round((won.length / sent.length) * 100) : 0,
      lostCount: lost.length,
      invoicedCount: live.length,
      invoiced: sum(live.map((i) => i.total)),
      received: sum(live.map((i) => i.amount_paid)),
      receivable: sum(open.map((i) => i.balance)),
      overdue,
      overdueValue: sum(overdue.map((i) => i.balance)),
      months,
      clients: [...byClient.values()].sort((a, b) => b.balance - a.balance),
      stages,
      recent,
    };
  }, [qs, inv, pays]);

  if (error) return <p className="text-red-600">Could not load: {error}</p>;
  if (!company || !loaded) return <DashboardSkeleton />;

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = (me?.full_name || me?.username || "").split(" ")[0];
  const collectedPct = d.invoiced ? Math.round((d.received / d.invoiced) * 100) : 0;

  return (
    <div className="-mx-4 -mt-6 space-y-6">
      {/* ================= HERO ================= */}
      <section className="hero px-4 pb-8 pt-6 text-white sm:rounded-b-3xl">
        <div className="relative z-10 mx-auto max-w-6xl">
          <div className="rise flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-sm text-cyan-300/90">
                {greet}
                {firstName && !isGuest ? `, ${firstName}` : ""}
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{company.name}</h1>
              <p className="mt-1 text-xs text-white/50">
                {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {!isGuest && (
                  <Link href="/quotations/new" className="btn-accent px-5 py-2.5">
                    + New Quotation
                  </Link>
                )}
                <Link href="/invoices" className="glass rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-white/10">
                  View invoices →
                </Link>
              </div>
            </div>

            {/* Big receivable number */}
            <div className="glass min-w-[260px] flex-1 rounded-2xl p-5 sm:max-w-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/60">Money to collect</p>
              <p className="mt-1 text-4xl font-black tracking-tight">
                <span className="omr">
                  <OmrSign className="text-cyan-300" />
                  <Counter value={d.receivable} />
                </span>
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${collectedPct}%`, background: "linear-gradient(90deg,#06b6d4,#2563eb)", transition: "width 1s" }}
                />
              </div>
              <p className="mt-1.5 text-xs text-white/60">
                {collectedPct}% of invoiced amount collected ({num(d.received)} of {num(d.invoiced)})
              </p>
              {d.overdue.length > 0 && (
                <Link
                  href="/invoices"
                  className="pulse-red mt-3 flex items-center justify-between rounded-xl bg-rose-600/90 px-3 py-2 text-sm font-semibold"
                >
                  <span>⚠ {d.overdue.length} overdue</span>
                  <Omr v={d.overdueValue} />
                </Link>
              )}
            </div>
          </div>

          {/* KPI tiles */}
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi delay={0} color="#2563eb" icon="📄" title="Quotations sent" count={d.sentCount} value={d.sentValue} />
            <Kpi delay={80} color="#06b6d4" icon="✅" title="Approved" count={d.wonCount} value={d.wonValue} />
            <Kpi delay={160} color="#8b5cf6" icon="🧾" title="Invoiced" count={d.invoicedCount} value={d.invoiced} />
            <Kpi delay={240} color="#e11d48" icon="💰" title="Received" count={null} value={d.received} />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-6 px-4">
        <Explain title="How to read this dashboard">
          <p><b>Money to collect</b> = issued invoices − payments received. The bar shows how much of all invoiced money is already in.</p>
          <p><b>Quotations sent</b> = every quotation that is not a draft. <b>Approved</b> = accepted by the client (approved + invoiced). <b>Win rate</b> = approved ÷ sent.</p>
          <p><b>Overdue</b> = issued invoices past their due date that still have a balance. Values include VAT.</p>
        </Explain>

        {/* ================= WIN RATE + CASH FLOW ================= */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="card rise relative overflow-hidden p-5" style={{ animationDelay: "120ms" }}>
            <h2 className="font-bold">Win rate</h2>
            <p className="text-xs text-slate-500">Approved quotations out of all sent</p>
            <div className="mt-4 flex items-center gap-5">
              <Ring pct={d.winRate} />
              <div className="space-y-2 text-sm">
                <Legend color="#06b6d4" label="Approved" value={d.wonCount} />
                <Legend color="#2563eb" label="Waiting" value={d.stages.find((s) => s.key === "submitted")?.count || 0} />
                <Legend color="#e11d48" label="Rejected" value={d.lostCount} />
              </div>
            </div>
          </div>

          <div className="card rise p-5 lg:col-span-2" style={{ animationDelay: "180ms" }}>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="font-bold">Cash flow, last 6 months</h2>
                <p className="text-xs text-slate-500">Invoiced vs money received, per month</p>
              </div>
              <div className="flex gap-3 text-xs">
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-blue-600" /> Invoiced</span>
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-rose-500" /> Received</span>
              </div>
            </div>
            <Bars months={d.months} />
          </div>
        </div>

        {/* ================= PIPELINE + RECEIVABLES ================= */}
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card rise p-5" style={{ animationDelay: "220ms" }}>
            <h2 className="font-bold">Quotation pipeline</h2>
            <p className="text-xs text-slate-500">Where every quotation stands right now</p>
            <div className="mt-4 space-y-3">
              {d.stages.map((s) => {
                const max = Math.max(...d.stages.map((x) => x.value), 1);
                return (
                  <Link href="/quotations" key={s.key} className="block">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">
                        {s.label} <span className="text-slate-400">({s.count})</span>
                      </span>
                      <span className="font-semibold">{num(s.value)}</span>
                    </div>
                    <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(2, (s.value / max) * 100)}%`, background: s.color, transition: "width 1s" }}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="card rise p-5" style={{ animationDelay: "260ms" }}>
            <h2 className="font-bold">Who owes you</h2>
            <p className="text-xs text-slate-500">Balance per client (bar = share already paid)</p>
            <div className="mt-4 space-y-4">
              {d.clients.length === 0 && <p className="text-sm text-slate-500">No issued invoices yet.</p>}
              {d.clients.slice(0, 6).map((c) => {
                const pct = c.invoiced ? (c.received / c.invoiced) * 100 : 0;
                return (
                  <div key={c.name}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{c.name}</span>
                      <span className={`shrink-0 font-bold ${c.balance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                        {c.balance > 0 ? <Omr v={c.balance} /> : "Paid ✓"}
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-rose-100">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#06b6d4,#2563eb)", transition: "width 1s" }} />
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      Paid {num(c.received)} of {num(c.invoiced)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ================= RECENT ACTIVITY ================= */}
        <div className="card rise overflow-hidden" style={{ animationDelay: "300ms" }}>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="font-bold">Latest activity</h2>
            <Link href="/quotations" className="text-sm font-semibold text-blue-600">See all →</Link>
          </div>
          {d.recent.length === 0 && <p className="px-5 py-4 text-sm text-slate-500">Nothing yet. Create your first quotation.</p>}
          {d.recent.map((r) => (
            <Link key={r.kind + r.id} href={r.href} className="flex items-center gap-3 border-t border-slate-50 px-5 py-3 hover:bg-slate-50">
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg text-white"
                style={{ background: r.kind === "Quotation" ? "linear-gradient(135deg,#1d4ed8,#06b6d4)" : "linear-gradient(135deg,#e11d48,#f97316)" }}
              >
                {r.kind === "Quotation" ? "Q" : "I"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {r.kind} {r.code} <span className="font-normal text-slate-500">· {r.who || "No client"}</span>
                </p>
                <p className="text-xs capitalize text-slate-400">
                  {r.status.replace(/_/g, " ")} · {date(r.at)}
                </p>
              </div>
              <span className="shrink-0 text-sm font-bold">{num(r.total)}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- pieces ---------- */

function Kpi({ title, count, value, color, icon, delay }: { title: string; count: number | null; value: number; color: string; icon: string; delay: number }) {
  return (
    <div className="glass rise relative overflow-hidden rounded-2xl p-4" style={{ animationDelay: `${delay}ms` }}>
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />
      <span className="absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-30 blur-2xl" style={{ background: color }} />
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">{title}</p>
        <span className="text-lg">{icon}</span>
      </div>
      <p className="mt-2 text-xl font-black sm:text-2xl">
        <span className="omr">
          <OmrSign className="opacity-70" />
          <Counter value={value} />
        </span>
      </p>
      <p className="text-xs text-white/50">{count !== null ? <><Counter value={count} money={false} /> documents</> : "in the bank"}</p>
    </div>
  );
}

function Ring({ pct }: { pct: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const shown = useCountUp(pct);
  return (
    <div className="relative h-36 w-36 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2563eb" />
            <stop offset="60%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#e11d48" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={r} fill="none" stroke="#eef2f7" strokeWidth="12" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="url(#ringGrad)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * shown) / 100}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-3xl font-black">{Math.round(shown)}%</p>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">won</p>
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <i className="h-3 w-3 rounded-full" style={{ background: color }} />
      <span className="text-slate-600">{label}</span>
      <b className="ml-auto pl-3">{value}</b>
    </div>
  );
}

function Bars({ months }: { months: { key: string; label: string; invoiced: number; received: number }[] }) {
  const max = Math.max(...months.flatMap((m) => [m.invoiced, m.received]), 1);
  return (
    <div className="mt-5 flex h-48 items-end gap-2 sm:gap-4">
      {months.map((m, i) => (
        <div key={m.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
          <div className="flex h-full w-full items-end justify-center gap-1">
            <div className="group relative flex h-full w-1/2 max-w-7 items-end">
              <div
                className="grow w-full rounded-t-md"
                style={{ height: `${(m.invoiced / max) * 100}%`, minHeight: m.invoiced ? 4 : 0, background: "linear-gradient(180deg,#3b82f6,#1d4ed8)", animationDelay: `${i * 70}ms` }}
              />
              {m.invoiced > 0 && <span className="absolute -top-5 left-1/2 hidden -translate-x-1/2 text-[10px] font-semibold text-blue-700 sm:block">{short(m.invoiced)}</span>}
            </div>
            <div className="relative flex h-full w-1/2 max-w-7 items-end">
              <div
                className="grow w-full rounded-t-md"
                style={{ height: `${(m.received / max) * 100}%`, minHeight: m.received ? 4 : 0, background: "linear-gradient(180deg,#fb7185,#e11d48)", animationDelay: `${i * 70 + 35}ms` }}
              />
              {m.received > 0 && <span className="absolute -top-5 left-1/2 hidden -translate-x-1/2 text-[10px] font-semibold text-rose-600 sm:block">{short(m.received)}</span>}
            </div>
          </div>
          <span className="text-[11px] font-medium text-slate-500">{m.label}</span>
        </div>
      ))}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="-mx-4 -mt-6">
      <div className="hero h-72 animate-pulse sm:rounded-b-3xl" />
      <div className="mx-auto mt-6 grid max-w-6xl gap-6 px-4 lg:grid-cols-3">
        {[0, 1, 2].map((k) => (
          <div key={k} className="card h-48 animate-pulse bg-slate-100" />
        ))}
      </div>
    </div>
  );
}
