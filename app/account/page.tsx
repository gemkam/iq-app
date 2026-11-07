"use client";
import { useState } from "react";
import { useMe } from "@/components/AuthGate";
import { changeOwnPassword } from "@/lib/auth";
import { roleLabel } from "@/lib/format";

export default function Account() {
  const { me, memberships, isGuest } = useMe();
  const [f, setF] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  if (!me) return null;
  if (isGuest) return <div className="card p-6 text-center text-slate-500">The guest account has no password to change.</div>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setOk(null);
    if (f.next !== f.confirm) return setErr("New passwords do not match.");
    if (f.next === f.current) return setErr("The new password is the same as the current one.");
    setBusy(true);
    try {
      await changeOwnPassword(me.username || "", f.current, f.next);
      setOk("Password changed. Use the new password next time you log in.");
      setF({ current: "", next: "", confirm: "" });
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-bold">My account</h1>

      <div className="card flex items-center gap-4 p-5">
        <span
          className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-xl font-black text-white"
          style={{ background: "linear-gradient(135deg,#2563eb,#e11d48)" }}
        >
          {(me.full_name || me.username || "?").slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-bold">{me.full_name}</p>
          <p className="text-sm text-slate-500">
            Username: <b>{me.username}</b>
          </p>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="mb-2 font-bold">My companies</h2>
        <ul className="space-y-1 text-sm">
          {memberships.map((m) => (
            <li key={m.company_id} className="flex justify-between gap-3">
              <span className="truncate">{m.company_name}</span>
              <span className="shrink-0 text-slate-500">{roleLabel(m.role)}</span>
            </li>
          ))}
        </ul>
      </div>

      <form onSubmit={submit} className="card space-y-3 p-5">
        <h2 className="font-bold">Change my password</h2>
        <div>
          <label className="lbl">Current password</label>
          <input className="input" type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} />
        </div>
        <div>
          <label className="lbl">New password</label>
          <input className="input" type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} />
        </div>
        <div>
          <label className="lbl">Confirm new password</label>
          <input className="input" type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} />
        </div>
        {err && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>}
        {ok && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{ok}</p>}
        <button className="btn-primary w-full py-3" disabled={busy || !f.current || !f.next || !f.confirm}>
          {busy ? "Saving..." : "Change password"}
        </button>
        <p className="text-xs text-slate-500">At least 4 characters. The change applies to all your companies.</p>
      </form>
    </div>
  );
}
