"use client";
import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { setActiveCompanyId } from "@/lib/activeCompany";
import { useMe } from "@/components/AuthGate";
import Explain from "@/components/Explain";

const blank = { name: "", cr_number: "", vatin: "", phone: "", email: "", address: "", vat_registered: false };

export default function Companies() {
  const { me, memberships, switchCompany, canCreateCompany, refresh } = useMe();
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setOk(null);
    if (!f.name.trim()) return setErr("Company name is required.");
    setBusy(true);
    const { data, error } = await supabase.rpc("create_company", {
      p_name: f.name.trim(),
      p_cr_number: f.cr_number || null,
      p_vatin: f.vatin || null,
      p_phone: f.phone || null,
      p_email: f.email || null,
      p_address: f.address || null,
      p_vat_registered: f.vat_registered,
    });
    setBusy(false);
    if (error) return setErr(error.message);
    setOk(`"${f.name.trim()}" created. You are its owner.`);
    setF(blank);
    // select the new company and reload the list of companies
    setActiveCompanyId(data as string);
    refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Companies</h1>
          <p className="text-sm text-slate-500">
            {memberships.length} {memberships.length === 1 ? "company" : "companies"} under your name
          </p>
        </div>
        {canCreateCompany && (
          <a href="#new-company" className="btn-accent">+ Add company</a>
        )}
      </div>

      <Explain title="Several companies under one login">
        <p>Each company is completely separate: its own clients, quotations (Q-1001, Q-1002...), invoices (1001, 1001-1...), users, logo, CR and VAT details.</p>
        <p>Use the company name at the top left to switch between companies. Everything you see and create belongs to the selected company.</p>
        <p>Add as many companies as you need under your name. To give another person access to more than one company, open Admin → Users in each company and use <b>Add existing user</b>.</p>
      </Explain>

      <div className="space-y-2">
        {memberships.map((m) => {
          const active = m.company_id === me?.company_id;
          return (
            <div key={m.company_id} className={`card flex flex-wrap items-center justify-between gap-3 p-4 ${active ? "ring-2 ring-blue-500/60" : ""}`}>
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-sm font-black text-white"
                  style={{ background: active ? "linear-gradient(135deg,#2563eb,#e11d48)" : "linear-gradient(135deg,#334155,#1e293b)" }}
                >
                  {m.company_name.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-bold">{m.company_name}</p>
                  <p className="text-xs capitalize text-slate-500">
                    Your role: {m.role === "staff" ? "user" : m.role} {active && <span className="font-semibold text-blue-600">· selected</span>}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {active ? (
                  (m.role === "owner" || m.role === "admin") && <Link href="/settings" className="btn-light">Edit details</Link>
                ) : (
                  <button className="btn-primary" onClick={() => switchCompany(m.company_id)}>Switch to this company</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {canCreateCompany ? (
      <form id="new-company" onSubmit={create} className="card grid gap-3 scroll-mt-28 p-4 sm:grid-cols-2">
        <h2 className="text-lg font-bold sm:col-span-2">+ Add a new company</h2>
        <div className="sm:col-span-2">
          <label className="lbl">Company name *</label>
          <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Al Waha Trading LLC" />
        </div>
        <div>
          <label className="lbl">CR number</label>
          <input className="input" value={f.cr_number} onChange={(e) => setF({ ...f, cr_number: e.target.value })} />
        </div>
        <div>
          <label className="lbl">VAT number (VATIN)</label>
          <input className="input" value={f.vatin} onChange={(e) => setF({ ...f, vatin: e.target.value })} />
        </div>
        <div>
          <label className="lbl">Phone</label>
          <input className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </div>
        <div>
          <label className="lbl">Email</label>
          <input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label className="lbl">Address</label>
          <input className="input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder="Muscat, Oman" />
        </div>
        <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
          <input type="checkbox" className="h-4 w-4" checked={f.vat_registered} onChange={(e) => setF({ ...f, vat_registered: e.target.checked })} />
          VAT registered (applies 5% VAT and prints TAX INVOICE)
        </label>
        {err && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">{err}</p>}
        {ok && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 sm:col-span-2">{ok}</p>}
        <div className="sm:col-span-2">
          <button className="btn-accent" disabled={busy}>{busy ? "Creating..." : "Create company"}</button>
        </div>
      </form>
      ) : (
        <p className="card p-4 text-sm text-slate-500">Only owners and admins can add new companies.</p>
      )}
    </div>
  );
}
