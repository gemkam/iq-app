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
    // Checks the password as soon as all 6 digits are typed. No button needed.
    const check = async (value: string) => {
      setErr(null);
      setBusy(true);
      const { data, error } = await supabase.rpc("verify_admin_pin", { p_pin: value });
      setBusy(false);
      if (error || !data) {
        setErr("Incorrect password");
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
      <div className="card mx-auto mt-6 max-w-sm space-y-4 p-6 text-center">
        <div className="text-4xl">🔒</div>
        <h1 className="text-xl font-bold">Admin is locked</h1>
        <p className="text-sm text-slate-500">Type the admin password. It opens automatically.</p>
        <input
          className={`input text-center text-2xl tracking-[0.5em] ${err ? "border-red-500" : ""}`}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          autoFocus
          readOnly={busy}
          value={pin}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 6);
            setPin(v);
            if (err) setErr(null);
            if (v.length === 6) check(v);
          }}
          placeholder="••••••"
        />
        <p className={`h-5 text-sm font-semibold ${err ? "text-red-600" : "text-slate-400"}`}>{busy ? "Checking..." : err || ""}</p>
      </div>
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
