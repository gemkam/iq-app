"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useMe } from "./AuthGate";

// Admin pages: only owners/admins, and only after entering the admin password.
// Once unlocked, it stays open until the browser tab is closed or Lock is pressed.
const KEY = "iq_admin_unlocked";

function isUnlocked() {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function lockAdmin() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export default function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useMe();
  const [ok, setOk] = useState(false);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setOk(isUnlocked()), []);

  if (!isAdmin) return <div className="card p-6 text-center text-slate-500">Only admins can open this page.</div>;

  if (!ok) {
    const submit = async (e: React.FormEvent) => {
      e.preventDefault();
      setErr(null);
      setBusy(true);
      const { data, error } = await supabase.rpc("verify_admin_pin", { p_pin: pin });
      setBusy(false);
      if (error || !data) {
        setErr("Wrong admin password.");
        setPin("");
        return;
      }
      try {
        sessionStorage.setItem(KEY, "1");
      } catch {
        /* storage blocked: unlocked for this page only */
      }
      setOk(true);
    };
    return (
      <form onSubmit={submit} className="card mx-auto mt-6 max-w-sm space-y-4 p-6 text-center">
        <div className="text-4xl">🔒</div>
        <h1 className="text-xl font-bold">Admin is locked</h1>
        <p className="text-sm text-slate-500">Enter the admin password to manage users, companies and settings.</p>
        <input
          className="input text-center text-lg tracking-[0.4em]"
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="••••••"
        />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="btn-primary w-full py-3" disabled={busy || !pin}>{busy ? "Checking..." : "Unlock"}</button>
      </form>
    );
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <button
          className="text-xs font-semibold text-slate-500 hover:text-red-600"
          onClick={() => {
            lockAdmin();
            setOk(false);
          }}
        >
          🔒 Lock admin
        </button>
      </div>
      {children}
    </>
  );
}
