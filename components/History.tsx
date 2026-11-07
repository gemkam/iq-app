"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { dateTime } from "@/lib/format";

type Row = {
  id: number;
  table_name: string;
  action: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_at: string;
  changed_by: string | null;
};

const SKIP = new Set(["updated_at", "created_at", "id", "company_id", "quotation_id", "invoice_id", "amount", "code", "balance", "share_token"]);
const NAMES: Record<string, string> = {
  quotations: "Quotation",
  quotation_items: "Item",
  invoices: "Invoice",
  invoice_items: "Item",
  payments: "Payment",
};

function describe(r: Row): string {
  const what = NAMES[r.table_name] || r.table_name;
  if (r.action === "insert") {
    const d = r.new_data || {};
    if (r.table_name.endsWith("items")) return `${what} added: ${d.description} (${d.quantity} ${d.unit} x ${d.unit_rate})`;
    if (r.table_name === "payments") return `Payment received: ${d.amount}`;
    return `${what} created`;
  }
  if (r.action === "delete") {
    const d = r.old_data || {};
    if (r.table_name.endsWith("items")) return `${what} removed: ${d.description}`;
    return `${what} deleted`;
  }
  const o = r.old_data || {};
  const n = r.new_data || {};
  const changes = Object.keys(n)
    .filter((k) => !SKIP.has(k) && JSON.stringify(o[k]) !== JSON.stringify(n[k]))
    .map((k) => `${k.replace(/_/g, " ")}: ${o[k] ?? "-"} → ${n[k] ?? "-"}`);
  return changes.length ? `${what} changed. ${changes.join(", ")}` : "";
}

export default function History({ recordId, parentKey }: { recordId: string; parentKey: "quotation_id" | "invoice_id" }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    supabase
      .from("company_members")
      .select("user_id, full_name, username")
      .then(({ data }) => {
        const m: Record<string, string> = {};
        (data || []).forEach((r: { user_id: string; full_name: string | null; username: string | null }) => (m[r.user_id] = r.full_name || r.username || ""));
        setNames(m);
      });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    supabase
      .from("audit_log")
      .select("id, table_name, action, old_data, new_data, changed_at, changed_by")
      .or(`record_id.eq.${recordId},new_data->>${parentKey}.eq.${recordId},old_data->>${parentKey}.eq.${recordId}`)
      .order("changed_at", { ascending: false })
      .limit(200)
      .then(({ data }) => setRows((data as Row[]) || []));
  }, [open, recordId, parentKey]);

  const lines = rows.map((r) => ({ r, text: describe(r) })).filter((x) => x.text);

  return (
    <div className="card no-print p-4">
      <button className="flex w-full items-center justify-between text-left font-semibold" onClick={() => setOpen(!open)}>
        <span>Change history</span>
        <span className="text-slate-400">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <ul className="mt-3 space-y-2 text-sm">
          {lines.length === 0 && <li className="text-slate-500">No changes recorded yet.</li>}
          {lines.map(({ r, text }) => (
            <li key={r.id} className="flex flex-col gap-0.5 border-l-2 border-slate-200 pl-3 sm:flex-row sm:gap-3">
              <span className="shrink-0 text-xs text-slate-400 sm:w-40">{dateTime(r.changed_at)}</span>
              <span className="break-words">
                {text}
                {r.changed_by && names[r.changed_by] && <span className="text-slate-400"> · by {names[r.changed_by]}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
