"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { adminCall } from "@/lib/auth";
import { roleLabel } from "@/lib/format";
import { stateColor, stateLabel, subStatus } from "@/lib/subscription";
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
  // Who will own the new company
  const [ownerMode, setOwnerMode] = useState<"me" | "new" | "existing">("me");
  const [ow, setOw] = useState({ full_name: "", username: "", password: "1234" });
  // Company owners shown on each company card
  const [owners, setOwners] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const ids = memberships.map((m) => m.company_id);
    if (!ids.length) return;
    supabase
      .from("company_members")
      .select("company_id, full_name, username")
      .in("company_id", ids)
      .eq("role", "owner")
      .eq("is_active", true)
      .then(({ data }) => {
        const map: Record<string, string[]> = {};
        (data || []).forEach((r: { company_id: string; full_name: string | null; username: string | null }) => {
          (map[r.company_id] ||= []).push(r.full_name || r.username || "");
        });
        setOwners(map);
      });
  }, [memberships]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setOk(null);
    if (!f.name.trim()) return setErr("Company name is required.");
    if (ownerMode === "new" && (!ow.full_name.trim() || !ow.username.trim() || !ow.password)) return setErr("Enter the owner's name, username and password.");
    if (ownerMode === "existing" && !ow.username.trim()) return setErr("Enter the owner's username.");
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
    if (error) {
      setBusy(false);
      return setErr(error.message);
    }
    const cid = data as string;
    const uname = ow.username.trim().toLowerCase();
    let msg = `"${f.name.trim()}" created.`;
    try {
      if (ownerMode === "new") {
        await adminCall("create", { company_id: cid, full_name: ow.full_name.trim(), username: uname, password: ow.password, role: "owner" });
        msg += ` Owner login: username ${uname}, password ${ow.password}`;
      } else if (ownerMode === "existing") {
        await adminCall("add_member", { company_id: cid, username: uname, role: "owner" });
        msg += ` ${uname} is now its company owner.`;
      }
    } catch (e2) {
      msg += ` But the owner could not be added: ${(e2 as Error).message}. Add them in Admin → Users.`;
    }
    setBusy(false);
    setOk(msg);
    setF(blank);
    setOw({ full_name: "", username: "", password: "1234" });
    setOwnerMode("me");
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
        <p>Administrators can add as many companies as needed and give each one a <b>company owner</b>. The owner works fully in their own companies (quotations, invoices, payments) but does not see Admin. One owner can have several companies.</p>
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
                  <p className="flex flex-wrap items-center gap-2 font-bold">
                    <span className="truncate">{m.company_name}</span>
                    {(() => {
                      const st = subStatus(m.sub);
                      return (
                        <span className={`badge ${stateColor[st.state]}`}>
                          {stateLabel[st.state]}
                          {(st.state === "trial" || st.state === "paid") && ` · ${st.daysLeft}d`}
                        </span>
                      );
                    })()}
                  </p>
                  <p className="text-xs text-slate-500">
                    You: {roleLabel(m.role)} {active && <span className="font-semibold text-blue-600">· selected</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    Company owner: <b>{owners[m.company_id]?.join(", ") || "not assigned"}</b>
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {active ? (
                  <>
                    {(m.role === "admin" || m.role === "owner") && <Link href="/design" className="btn-accent">🎨 PDF design</Link>}
                    {m.role === "admin" && <Link href="/settings" className="btn-light">Edit details</Link>}
                  </>
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
        <div className="space-y-3 rounded-xl border border-slate-200 p-3 sm:col-span-2">
          <p className="lbl">Company owner</p>
          <div className="flex flex-wrap gap-2 text-sm">
            {[
              ["me", "No owner yet (only me)"],
              ["new", "Create new owner"],
              ["existing", "Existing user"],
            ].map(([k, t]) => (
              <button
                type="button"
                key={k}
                onClick={() => setOwnerMode(k as typeof ownerMode)}
                className={`rounded-lg px-3 py-1.5 ${ownerMode === k ? "bg-blue-600 text-white" : "btn-light"}`}
              >
                {t}
              </button>
            ))}
          </div>
          {ownerMode === "new" && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="lbl">Owner name</label>
                <input className="input" value={ow.full_name} onChange={(e) => setOw({ ...ow, full_name: e.target.value })} placeholder="Ramzan Ali" />
              </div>
              <div>
                <label className="lbl">Username</label>
                <input className="input" autoCapitalize="none" value={ow.username} onChange={(e) => setOw({ ...ow, username: e.target.value })} placeholder="ramzan" />
              </div>
              <div>
                <label className="lbl">Password</label>
                <input className="input" value={ow.password} onChange={(e) => setOw({ ...ow, password: e.target.value })} />
              </div>
            </div>
          )}
          {ownerMode === "existing" && (
            <div>
              <label className="lbl">Username of the owner</label>
              <input className="input" autoCapitalize="none" value={ow.username} onChange={(e) => setOw({ ...ow, username: e.target.value })} placeholder="someone who already has a login" />
              <p className="mt-1 text-xs text-slate-500">One owner can have several companies. They switch between them at the top left.</p>
            </div>
          )}
          <p className="text-xs text-slate-500">The company owner gets full access to this company&apos;s quotations, invoices and payments. They do not see Admin. You stay administrator of every company.</p>
        </div>

        {err && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">{err}</p>}
        {ok && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 sm:col-span-2">{ok}</p>}
        <div className="sm:col-span-2">
          <button className="btn-accent" disabled={busy}>{busy ? "Creating..." : "Create company"}</button>
        </div>
      </form>
      ) : (
        <p className="card p-4 text-sm text-slate-500">Only administrators can add new companies.</p>
      )}
    </div>
  );
}
