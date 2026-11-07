"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useMe } from "@/components/AuthGate";
import AdminOnly from "@/components/AdminOnly";
import Explain from "@/components/Explain";
import { roleLabel } from "@/lib/format";
import { describe, referencedIds, type ActivityRow, type Described } from "@/lib/activity";

type Member = { user_id: string; full_name: string | null; username: string | null; role: string; company_id: string };
type Entry = { row: ActivityRow; d: Described; count: number };

const PAGE = 150;
const TYPES = [
  ["all", "Everything"],
  ["session", "Logins"],
  ["quotations", "Quotations"],
  ["invoices", "Invoices"],
  ["payments", "Payments"],
  ["clients", "Clients"],
  ["files", "Files"],
  ["users", "Users"],
  ["company", "Company & subscription"],
] as const;
const TABLES: Record<string, string[]> = {
  session: ["session"],
  quotations: ["quotations", "quotation_items"],
  invoices: ["invoices", "invoice_items"],
  payments: ["payments"],
  clients: ["clients"],
  files: ["attachments"],
  users: ["users"],
  company: ["companies", "subscription"],
};
const RANGES = [
  ["1", "Today"],
  ["7", "7 days"],
  ["30", "30 days"],
  ["all", "All time"],
] as const;

const time = (s: string) => new Date(s).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const day = (s: string) => {
  const d = new Date(s);
  const t = new Date();
  const y = new Date(Date.now() - 864e5);
  if (d.toDateString() === t.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
};

export default function Activity() {
  const { memberships } = useMe();
  const companyIds = useMemo(() => memberships.filter((m) => m.role === "admin").map((m) => m.company_id), [memberships]);
  const companyName = useMemo(() => Object.fromEntries(memberships.map((m) => [m.company_id, m.company_name])), [memberships]);

  const [members, setMembers] = useState<Member[]>([]);
  const [userF, setUserF] = useState("all");
  const [companyF, setCompanyF] = useState("all");
  const [typeF, setTypeF] = useState("all");
  const [rangeF, setRangeF] = useState("7");
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (!companyIds.length) return;
    supabase
      .from("company_members")
      .select("user_id, full_name, username, role, company_id")
      .in("company_id", companyIds)
      .then(({ data }) => setMembers((data as Member[]) || []));
  }, [companyIds]);

  const people = useMemo(() => {
    const m = new Map<string, Member>();
    members.forEach((x) => {
      const prev = m.get(x.user_id);
      // show the highest role the person has
      if (!prev || (x.role === "admin" && prev.role !== "admin")) m.set(x.user_id, x);
    });
    return [...m.values()].sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
  }, [members]);
  const personOf = (uid: string | null) => (uid ? people.find((p) => p.user_id === uid) : undefined);

  const load = useCallback(
    async (offset: number) => {
      if (!companyIds.length) return;
      setLoading(true);
      let q = supabase
        .from("audit_log")
        .select("id, company_id, table_name, record_id, action, old_data, new_data, changed_by, changed_at")
        .in("company_id", companyF === "all" ? companyIds : [companyF])
        .order("changed_at", { ascending: false })
        .range(offset, offset + PAGE - 1);
      if (userF !== "all") q = q.eq("changed_by", userF);
      if (typeF !== "all") q = q.in("table_name", TABLES[typeF]);
      if (rangeF !== "all") q = q.gte("changed_at", new Date(Date.now() - Number(rangeF) * 864e5).toISOString());
      const { data } = await q;
      const list = (data as ActivityRow[]) || [];

      // look up document codes (Q-1001, 1001-1) for readable text
      const { quotationIds, invoiceIds } = referencedIds(list);
      const map: Record<string, string> = {};
      const [qs, is] = await Promise.all([
        quotationIds.length ? supabase.from("quotations").select("id, code").in("id", quotationIds.slice(0, 300)) : Promise.resolve({ data: [] }),
        invoiceIds.length ? supabase.from("invoices").select("id, code").in("id", invoiceIds.slice(0, 300)) : Promise.resolve({ data: [] }),
      ]);
      [...((qs.data as { id: string; code: string }[]) || []), ...((is.data as { id: string; code: string }[]) || [])].forEach((x) => (map[x.id] = x.code));

      setCodes((c) => ({ ...(offset ? c : {}), ...map }));
      setRows((r) => (offset ? [...r, ...list] : list));
      setMore(list.length === PAGE);
      setLoading(false);
    },
    [companyIds, companyF, userF, typeF, rangeF]
  );

  useEffect(() => {
    load(0);
  }, [load]);

  // Readable entries; several line edits of one document within 2 minutes become one entry
  const entries = useMemo(() => {
    const out: Entry[] = [];
    rows.forEach((row) => {
      const d = describe(row, codes);
      if (!d) return;
      const prev = out[out.length - 1];
      const isLine = row.table_name.endsWith("_items");
      if (
        prev &&
        isLine &&
        prev.row.table_name === row.table_name &&
        prev.row.changed_by === row.changed_by &&
        prev.d.href === d.href &&
        Math.abs(new Date(prev.row.changed_at).getTime() - new Date(row.changed_at).getTime()) < 120000
      ) {
        prev.count += 1;
        return;
      }
      out.push({ row, d, count: 1 });
    });
    return out;
  }, [rows, codes]);

  // Summary per person in the loaded period
  const perPerson = useMemo(() => {
    const m = new Map<string, number>();
    entries.forEach((e) => {
      const k = e.row.changed_by || "system";
      m.set(k, (m.get(k) || 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  let lastDay = "";

  return (
    <AdminOnly>
      <div className="space-y-4">
        <div>
          <Link href="/admin" className="text-sm text-slate-500">← Admin</Link>
          <h1 className="text-2xl font-bold">Activity</h1>
          <p className="text-sm text-slate-500">Who did what, in every company you administer</p>
        </div>

        <Explain title="What is recorded">
          <p>Logins and logouts, quotations (create, edit, status), quotation and invoice lines, invoices (create, issue, cancel), payments, clients, file uploads, company details, and user changes (new users, passwords, roles, disabling).</p>
          <p>Several line edits on the same document within 2 minutes are grouped into one entry. Tap an entry to open the document.</p>
        </Explain>

        {/* Filters */}
        <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="lbl">Person</label>
            <select className="input" value={userF} onChange={(e) => setUserF(e.target.value)}>
              <option value="all">Everyone</option>
              {people.map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {p.full_name || p.username} ({roleLabel(p.role)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="lbl">Company</label>
            <select className="input" value={companyF} onChange={(e) => setCompanyF(e.target.value)}>
              <option value="all">All companies</option>
              {companyIds.map((id) => (
                <option key={id} value={id}>{companyName[id]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="lbl">Type</label>
            <select className="input" value={typeF} onChange={(e) => setTypeF(e.target.value)}>
              {TYPES.map(([k, t]) => (
                <option key={k} value={k}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="lbl">Period</label>
            <div className="grid grid-cols-4 gap-1">
              {RANGES.map(([k, t]) => (
                <button
                  key={k}
                  onClick={() => setRangeF(k)}
                  className={`rounded-lg px-1 py-2 text-xs font-semibold ${rangeF === k ? "bg-blue-600 text-white" : "btn-light !px-1"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Per person summary */}
        {perPerson.length > 0 && userF === "all" && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {perPerson.map(([uid, n]) => {
              const p = personOf(uid === "system" ? null : uid);
              return (
                <button
                  key={uid}
                  onClick={() => uid !== "system" && setUserF(uid)}
                  className="card flex shrink-0 items-center gap-2 px-3 py-2 text-left hover:shadow-md"
                >
                  <Avatar name={p?.full_name || p?.username || "System"} admin={p?.role === "admin"} />
                  <span>
                    <span className="block text-sm font-semibold">{p?.full_name || p?.username || "System"}</span>
                    <span className="block text-xs text-slate-500">{n} actions</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Timeline */}
        <div className="card overflow-hidden">
          {loading && rows.length === 0 && <p className="p-5 text-sm text-slate-500">Loading...</p>}
          {!loading && entries.length === 0 && <p className="p-5 text-sm text-slate-500">No activity for these filters.</p>}
          {entries.map((e) => {
            const p = personOf(e.row.changed_by);
            const name = p?.full_name || p?.username || (e.row.table_name === "users" ? "System" : "Unknown");
            const dLabel = day(e.row.changed_at);
            const showDay = dLabel !== lastDay;
            lastDay = dLabel;
            const text =
              e.count > 1 && e.row.table_name.endsWith("_items")
                ? `${e.d.text.split(" ")[0]} lines updated (${e.count} changes)`
                : e.d.text;
            const body = (
              <div className="flex gap-3 px-4 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-base" style={{ background: `${e.d.color}22` }}>
                  {e.d.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <b>{name}</b>{" "}
                    {p && <span className="text-xs text-slate-400">({roleLabel(p.role)})</span>}
                  </p>
                  <p className="break-words text-sm text-slate-600">{text}</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {time(e.row.changed_at)}
                    {companyIds.length > 1 && <> · {companyName[e.row.company_id]}</>}
                  </p>
                </div>
              </div>
            );
            return (
              <div key={e.row.id}>
                {showDay && (
                  <div className="border-y border-slate-100 bg-slate-50 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                    {dLabel}
                  </div>
                )}
                {e.d.href ? (
                  <Link href={e.d.href} className="block hover:bg-slate-50">{body}</Link>
                ) : (
                  body
                )}
              </div>
            );
          })}
          {more && (
            <div className="border-t border-slate-100 p-3 text-center">
              <button className="btn-light" disabled={loading} onClick={() => load(rows.length)}>
                {loading ? "Loading..." : "Load more"}
              </button>
            </div>
          )}
        </div>
      </div>
    </AdminOnly>
  );
}

function Avatar({ name, admin }: { name: string; admin?: boolean }) {
  return (
    <span
      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-black text-white"
      style={{ background: admin ? "linear-gradient(135deg,#e11d48,#f97316)" : "linear-gradient(135deg,#2563eb,#06b6d4)" }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
