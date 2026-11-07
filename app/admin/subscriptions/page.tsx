"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useMe } from "@/components/AuthGate";
import AdminOnly from "@/components/AdminOnly";
import Explain from "@/components/Explain";
import Omr from "@/components/Omr";
import { date } from "@/lib/format";
import { planLabel, stateColor, stateLabel, subStatus, type SubState } from "@/lib/subscription";

type Co = {
  id: string;
  name: string;
  phone: string | null;
  created_at: string;
  plan: string;
  trial_ends_at: string;
  paid_until: string | null;
  suspended: boolean;
};
type Pay = { id: string; company_id: string; plan: string; months: number; amount: number; method: string | null; reference: string | null; period_to: string; created_at: string };
type Owner = { company_id: string; full_name: string | null; username: string | null };

const FILTERS: (SubState | "all")[] = ["all", "trial", "paid", "expired", "suspended", "unlimited"];

export default function Subscriptions() {
  const { memberships, refresh } = useMe();
  const ids = useMemo(() => memberships.filter((m) => m.role === "admin").map((m) => m.company_id), [memberships]);
  const [cos, setCos] = useState<Co[]>([]);
  const [pays, setPays] = useState<Pay[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [filter, setFilter] = useState<SubState | "all">("all");
  const [openPay, setOpenPay] = useState<string | null>(null);
  const [form, setForm] = useState({ plan: "basic", months: "1", amount: "", method: "bank", reference: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ids.length) return;
    const [c, p, o] = await Promise.all([
      supabase.from("companies").select("id, name, phone, created_at, plan, trial_ends_at, paid_until, suspended").in("id", ids).order("created_at", { ascending: false }),
      supabase.from("subscription_payments").select("*").in("company_id", ids).order("created_at", { ascending: false }),
      supabase.from("company_members").select("company_id, full_name, username").in("company_id", ids).eq("role", "owner").eq("is_active", true),
    ]);
    setCos((c.data as Co[]) || []);
    setPays((p.data as Pay[]) || []);
    setOwners((o.data as Owner[]) || []);
  }, [ids]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = cos.map((c) => ({ c, s: subStatus(c) }));
  const counts = FILTERS.reduce((acc, f) => ({ ...acc, [f]: f === "all" ? rows.length : rows.filter((r) => r.s.state === f).length }), {} as Record<string, number>);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const thisMonth = pays.filter((p) => p.created_at >= monthStart).reduce((s, p) => s + Number(p.amount), 0);
  const shown = rows
    .filter((r) => filter === "all" || r.s.state === filter)
    .sort((a, b) => {
      // most urgent first: expired, trial ending soon, then the rest
      const rank = (x: typeof a) =>
        x.s.state === "expired" ? 0 : x.s.state === "trial" ? 1 : x.s.state === "paid" ? 2 : x.s.state === "suspended" ? 3 : 4;
      return rank(a) - rank(b) || a.s.daysLeft - b.s.daysLeft;
    });

  const act = async (fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    setBusy(true);
    setMsg(null);
    const { error } = await fn();
    setBusy(false);
    if (error) setMsg({ ok: false, text: error.message });
    else {
      setMsg({ ok: true, text: ok });
      setOpenPay(null);
      await load();
      refresh();
    }
  };

  const recordPayment = (c: Co) =>
    act(
      () =>
        supabase.rpc("record_subscription_payment", {
          p_company: c.id,
          p_months: Number(form.months),
          p_amount: Number(form.amount) || 0,
          p_plan: form.plan,
          p_method: form.method,
          p_reference: form.reference || null,
        }),
      `Payment recorded for ${c.name}: ${form.months} month(s).`
    );

  return (
    <AdminOnly>
      <div className="space-y-4">
        <div>
          <Link href="/admin" className="text-sm text-slate-500">← Admin</Link>
          <h1 className="text-2xl font-bold">Subscriptions</h1>
        </div>

        <Explain title="How subscriptions work">
          <p>Every new company gets a <b>7-day free trial</b>. When the trial or the paid period ends, the company becomes <b>view only</b> for its owner: they can see and download everything but cannot create or change anything. Data is never deleted.</p>
          <p>When a customer pays you (bank transfer, cash, payment link), press <b>Record payment</b>. The paid period starts from today or from the current end date, whichever is later.</p>
          <p>Administrators can always edit every company, even when it is expired. Companies created by administrators are <b>Unlimited</b> (no trial, never expire). Use <b>Make unlimited</b> for any company that should never expire.</p>
        </Explain>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Companies" value={String(rows.length)} />
          <Stat label="On free trial" value={String(counts.trial || 0)} tone="text-amber-500" />
          <Stat label="Paying" value={String(counts.paid || 0)} tone="text-emerald-500" />
          <Stat label="Collected this month" value={<Omr v={thisMonth} />} />
        </div>

        <div className="flex gap-1 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${filter === f ? "bg-blue-600 text-white" : "btn-light !py-1.5"}`}
            >
              {f === "all" ? "All" : stateLabel[f]} ({counts[f] || 0})
            </button>
          ))}
        </div>

        {msg && <p className={`rounded-lg p-3 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}

        <div className="space-y-3">
          {shown.map(({ c, s }) => {
            const own = owners.filter((o) => o.company_id === c.id).map((o) => o.full_name || o.username);
            const cPays = pays.filter((p) => p.company_id === c.id);
            return (
              <div key={c.id} className="card space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold">{c.name}</p>
                    <p className="text-xs text-slate-500">
                      Owner: <b>{own.join(", ") || "not assigned"}</b>
                      {c.phone && <> · {c.phone}</>} · joined {date(c.created_at)}
                    </p>
                  </div>
                  <span className={`badge ${stateColor[s.state]}`}>{stateLabel[s.state]}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <Info k="Plan" v={planLabel(c.plan)} />
                  <Info k="Trial ends" v={s.state === "unlimited" ? "No trial" : date(c.trial_ends_at)} />
                  <Info k="Paid until" v={c.paid_until ? date(c.paid_until) : "-"} />
                  <Info
                    k={s.state === "expired" ? "Expired" : "Days left"}
                    v={
                      s.state === "unlimited"
                        ? "No limit"
                        : s.state === "expired" || s.state === "suspended"
                          ? date(s.endsAt) || "-"
                          : `${s.daysLeft} days`
                    }
                    tone={s.state === "expired" ? "text-rose-500" : s.daysLeft <= 5 ? "text-amber-500" : ""}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <button className="btn-primary" disabled={busy} onClick={() => setOpenPay(openPay === c.id ? null : c.id)}>
                    💳 Record payment
                  </button>
                  <button
                    className="btn-light"
                    disabled={busy}
                    onClick={() => act(() => supabase.rpc("extend_trial", { p_company: c.id, p_days: 7 }), `Trial of ${c.name} extended by 7 days.`)}
                  >
                    +7 days trial
                  </button>
                  <button
                    className="btn-light"
                    disabled={busy}
                    onClick={() => act(() => supabase.rpc("extend_trial", { p_company: c.id, p_days: 7 }), `Trial of ${c.name} extended by 7 days.`)}
                  >
                    +7 days trial
                  </button>
                  <button
                    className="btn-light"
                    disabled={busy}
                    onClick={() =>
                      act(
                        () => supabase.rpc("set_company_unlimited", { p_company: c.id, p_unlimited: c.plan !== "unlimited" }),
                        c.plan === "unlimited" ? `${c.name} is back on trial / paid plan.` : `${c.name} is now Unlimited.`
                      )
                    }
                  >
                    {c.plan === "unlimited" ? "Remove unlimited" : "♾ Make unlimited"}
                  </button>
                  <button
                    className={c.suspended ? "btn-light text-emerald-600" : "btn-light text-rose-600"}
                    disabled={busy}
                    onClick={() => {
                      if (!c.suspended && !confirm(`Suspend ${c.name}? Its owner will only be able to view.`)) return;
                      act(
                        () => supabase.rpc("set_company_suspended", { p_company: c.id, p_suspended: !c.suspended }),
                        c.suspended ? `${c.name} is active again.` : `${c.name} suspended.`
                      );
                    }}
                  >
                    {c.suspended ? "Re-activate" : "Suspend"}
                  </button>
                  {cPays.length > 0 && (
                    <button className="btn-light" onClick={() => setHistory(history === c.id ? null : c.id)}>
                      Payments ({cPays.length})
                    </button>
                  )}
                </div>

                {openPay === c.id && (
                  <div className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-6 sm:items-end">
                    <div>
                      <label className="lbl">Plan</label>
                      <select className="input" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
                        <option value="basic">Basic</option>
                        <option value="pro">Pro</option>
                      </select>
                    </div>
                    <div>
                      <label className="lbl">Months</label>
                      <select className="input" value={form.months} onChange={(e) => setForm({ ...form, months: e.target.value })}>
                        {[1, 3, 6, 12].map((m) => (
                          <option key={m} value={m}>{m === 12 ? "12 (1 year)" : m}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="lbl">Amount (OMR)</label>
                      <input className="input" type="number" step="any" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                    </div>
                    <div>
                      <label className="lbl">Method</label>
                      <select className="input" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                        <option value="bank">Bank transfer</option>
                        <option value="cash">Cash</option>
                        <option value="link">Payment link</option>
                        <option value="card">Card</option>
                      </select>
                    </div>
                    <div>
                      <label className="lbl">Reference</label>
                      <input className="input" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
                    </div>
                    <button className="btn-accent" disabled={busy} onClick={() => recordPayment(c)}>
                      Save payment
                    </button>
                  </div>
                )}

                {history === c.id && (
                  <div className="space-y-1 rounded-xl border border-slate-200 p-3 text-sm">
                    {cPays.map((p) => (
                      <div key={p.id} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-1 last:border-0">
                        <span>
                          {date(p.created_at)} · {planLabel(p.plan)} · {p.months} month(s) · {p.method}
                          {p.reference && ` · ${p.reference}`}
                        </span>
                        <span className="font-semibold">
                          <Omr v={p.amount} /> <span className="text-xs font-normal text-slate-500">until {date(p.period_to)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {shown.length === 0 && <p className="card p-5 text-sm text-slate-500">No companies in this list.</p>}
        </div>
      </div>
    </AdminOnly>
  );
}

function Stat({ label, value, tone = "" }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function Info({ k, v, tone = "" }: { k: string; v: string; tone?: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase text-slate-500">{k}</p>
      <p className={`font-semibold ${tone}`}>{v}</p>
    </div>
  );
}
