"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import AdminOnly from "@/components/AdminOnly";
import { adminCall } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import Explain from "@/components/Explain";

type U = {
  user_id: string;
  role: "owner" | "admin" | "staff" | "guest";
  username: string | null;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
  last_sign_in_at: string | null;
};

const roleName = { owner: "Owner", admin: "Admin", staff: "User", guest: "Guest (view only)" };

export default function Users() {
  const [users, setUsers] = useState<U[]>([]);
  const [meId, setMeId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ full_name: "", username: "", password: "1234", role: "staff" });

  const load = async () => {
    try {
      const r = await adminCall<{ me: string; users: U[] }>("list");
      setUsers(r.users);
      setMeId(r.me);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setErr(null);
    setOk(null);
    setBusy(true);
    try {
      await fn();
      setOk(success);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    const uname = f.username.trim().toLowerCase();
    run(async () => {
      await adminCall("create", { ...f, username: uname });
      setF({ full_name: "", username: "", password: "1234", role: "staff" });
    }, `User "${uname}" created. Password: ${f.password}`);
  };

  const resetPw = (u: U) => {
    const p = prompt(`New password for ${u.username}`, "1234");
    if (!p) return;
    run(() => adminCall("reset_password", { user_id: u.user_id, password: p }), `Password for ${u.username} changed to: ${p}`);
  };

  return (
    <AdminOnly>
      <div className="space-y-4">
        <div>
          <Link href="/admin" className="text-sm text-slate-500">← Admin</Link>
          <h1 className="text-2xl font-bold">Users</h1>
        </div>

        <Explain title="Users">
          <p>Create a login for each tester. Give them the <b>username</b> and <b>password</b> shown in the green message.</p>
          <p><b>Disable</b> stops a user from logging in (their work stays). <b>Change password</b> sets a new one.</p>
          <p>Every change in quotations and invoices shows <b>who</b> made it in the Change history.</p>
          <p><b>Guest:</b> anyone can tap &quot;Continue as Guest&quot; on the login page to view the app without changing anything. The Guest account appears here after the first guest visit. Disable it to turn guest access off.</p>
        </Explain>

        <form onSubmit={create} className="card grid gap-3 p-4 sm:grid-cols-5 sm:items-end">
          <div className="sm:col-span-5 font-bold">Create user</div>
          <div>
            <label className="lbl">Name</label>
            <input className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} placeholder="Ali Khan" />
          </div>
          <div>
            <label className="lbl">Username</label>
            <input className="input" autoCapitalize="none" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} placeholder="ali" />
          </div>
          <div>
            <label className="lbl">Password</label>
            <input className="input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          </div>
          <div>
            <label className="lbl">Role</label>
            <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              <option value="staff">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button className="btn-primary" disabled={busy || !f.full_name || !f.username || !f.password}>+ Create user</button>
          <p className="text-xs text-slate-500 sm:col-span-5">
            User: quotations, invoices and payments. Admin: also manages users and company settings.
          </p>
        </form>

        {err && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>}
        {ok && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{ok}</p>}

        <div className="space-y-2">
          {users.map((u) => {
            const isMe = u.user_id === meId;
            const locked = isMe || u.role === "owner";
            return (
              <div key={u.user_id} className={`card flex flex-wrap items-center justify-between gap-3 p-4 ${u.is_active ? "" : "opacity-60"}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{u.full_name}</span>
                    <span className="badge bg-slate-100 text-slate-700">{roleName[u.role]}</span>
                    {!u.is_active && <span className="badge bg-red-100 text-red-700">Disabled</span>}
                    {isMe && <span className="badge bg-sky-100 text-sky-700">You</span>}
                  </div>
                  <p className="text-sm text-slate-600">Username: <b>{u.username}</b></p>
                  <p className="text-xs text-slate-400">Last login: {u.last_sign_in_at ? dateTime(u.last_sign_in_at) : "Never"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {u.role !== "guest" && <button className="btn-light" disabled={busy} onClick={() => resetPw(u)}>Change password</button>}
                  {!locked && (
                    <>
                      {u.role !== "guest" && <button
                        className="btn-light"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () => adminCall("set_role", { user_id: u.user_id, role: u.role === "admin" ? "staff" : "admin" }),
                            `${u.username} is now ${u.role === "admin" ? "a User" : "an Admin"}`
                          )
                        }
                      >
                        {u.role === "admin" ? "Make user" : "Make admin"}
                      </button>}
                      <button
                        className={u.is_active ? "btn-light text-red-600" : "btn-light text-emerald-700"}
                        disabled={busy}
                        onClick={() =>
                          run(
                            () => adminCall("set_active", { user_id: u.user_id, active: !u.is_active }),
                            `${u.username} ${u.is_active ? "disabled" : "enabled"}`
                          )
                        }
                      >
                        {u.is_active ? "Disable" : "Enable"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AdminOnly>
  );
}
