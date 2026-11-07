"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthCard from "@/components/AuthCard";
import { adminCall, login } from "@/lib/auth";
import { setActiveCompanyId } from "@/lib/activeCompany";

export default function Signup() {
  const router = useRouter();
  const [f, setF] = useState({ company_name: "", full_name: "", phone: "", username: "", password: "", confirm: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (f.password !== f.confirm) return setErr("Passwords do not match.");
    setBusy(true);
    try {
      const uname = f.username.trim().toLowerCase();
      await adminCall("signup", {
        company_name: f.company_name,
        full_name: f.full_name,
        phone: f.phone,
        username: uname,
        password: f.password,
        company_id: null,
      });
      try {
        localStorage.removeItem("iq_company");
      } catch {
        /* ignore */
      }
      setActiveCompanyId("");
      await login(uname, f.password);
      router.replace("/");
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Start your free trial" subtitle="7 days free. No card needed.">
      <ul className="mb-4 space-y-1 text-sm text-slate-600">
        <li>✓ Quotations and invoices with VAT, discounts and Omani Rial</li>
        <li>✓ Advance and milestone invoices, payments and balances</li>
        <li>✓ Share by WhatsApp or PDF, attachments, dashboard</li>
      </ul>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="lbl">Company name</label>
          <input className="input" value={f.company_name} onChange={(e) => set("company_name", e.target.value)} placeholder="e.g. Al Noor Contracting LLC" />
        </div>
        <div>
          <label className="lbl">Your name</label>
          <input className="input" value={f.full_name} onChange={(e) => set("full_name", e.target.value)} />
        </div>
        <div>
          <label className="lbl">Mobile</label>
          <input className="input" type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+968" />
        </div>
        <div>
          <label className="lbl">Choose a username</label>
          <input className="input" autoCapitalize="none" autoCorrect="off" value={f.username} onChange={(e) => set("username", e.target.value)} />
          <p className="mt-1 text-xs text-slate-500">Letters and numbers, no spaces.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="lbl">Password</label>
            <input className="input" type="password" autoComplete="new-password" value={f.password} onChange={(e) => set("password", e.target.value)} />
          </div>
          <div>
            <label className="lbl">Confirm</label>
            <input className="input" type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => set("confirm", e.target.value)} />
          </div>
        </div>
        {err && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{err}</p>}
        <button
          className="btn-accent w-full py-3"
          disabled={busy || !f.company_name || !f.full_name || !f.username || !f.password || !f.confirm}
        >
          {busy ? "Creating your account..." : "Start 7-day free trial"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-blue-600">Log in</Link>
      </p>
    </AuthCard>
  );
}
