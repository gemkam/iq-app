"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminCall, login } from "@/lib/auth";
import AuthCard from "@/components/AuthCard";

export default function Setup() {
  const router = useRouter();
  const [f, setF] = useState({ full_name: "", username: "", password: "", confirm: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    adminCall<{ needs_setup: boolean }>("status")
      .then((r) => (r.needs_setup ? setChecked(true) : router.replace("/login")))
      .catch((e) => {
        setErr((e as Error).message);
        setChecked(true);
      });
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (f.password !== f.confirm) return setErr("Passwords do not match.");
    setBusy(true);
    try {
      await adminCall("bootstrap", { full_name: f.full_name, username: f.username, password: f.password });
      await login(f.username, f.password);
      router.replace("/admin/users");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!checked) return <p className="p-6 text-slate-500">Loading...</p>;

  return (
    <AuthCard title="Create admin account" subtitle="First time setup. This account manages all users.">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="lbl">Your name</label>
          <input className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
        </div>
        <div>
          <label className="lbl">Username</label>
          <input className="input" autoCapitalize="none" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
          <p className="mt-1 text-xs text-slate-500">Letters and numbers, no spaces. Example: kamran</p>
        </div>
        <div>
          <label className="lbl">Password</label>
          <input className="input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </div>
        <div>
          <label className="lbl">Confirm password</label>
          <input className="input" type="password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} />
        </div>
        {err && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{err}</p>}
        <button className="btn-primary w-full py-3" disabled={busy}>{busy ? "Creating..." : "Create admin"}</button>
      </form>
    </AuthCard>
  );
}
