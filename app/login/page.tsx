"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminCall, login } from "@/lib/auth";
import AuthCard from "@/components/AuthCard";

export default function Login() {
  const router = useRouter();
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminCall<{ needs_setup: boolean }>("status")
      .then((r) => r.needs_setup && router.replace("/setup"))
      .catch(() => {});
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await login(u, p);
      router.replace("/");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return <AuthCard title="Log in" subtitle="Quotations & Invoices">
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="lbl">Username</label>
        <input className="input" autoCapitalize="none" autoCorrect="off" autoComplete="username" value={u} onChange={(e) => setU(e.target.value)} />
      </div>
      <div>
        <label className="lbl">Password</label>
        <input className="input" type="password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} />
      </div>
      {err && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{err}</p>}
      <button className="btn-primary w-full py-3" disabled={busy || !u || !p}>{busy ? "Logging in..." : "Log in"}</button>
    </form>
  </AuthCard>;
}

