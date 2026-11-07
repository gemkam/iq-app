import { roleLabel } from "./format";

// One line of the activity log (audit_log table)
export type ActivityRow = {
  id: number;
  company_id: string;
  table_name: string;
  record_id: string;
  action: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_by: string | null;
  changed_at: string;
};

export type Described = { icon: string; color: string; text: string; href?: string; group: string };

// Fields that change automatically (totals, counters) are not shown as user changes
const SKIP = new Set([
  "updated_at", "created_at", "id", "company_id", "quotation_id", "invoice_id", "client_id", "code", "balance", "share_token",
  "subtotal", "discount_amount", "vat_amount", "total", "amount_paid", "number", "base_no", "seq", "amount",
  "next_quotation_no", "next_invoice_no", "uploaded_by", "file_path", "created_by", "issued_at", "einvoice_status",
]);

const v = (x: unknown) => (x === null || x === undefined || x === "" ? "-" : String(x).replace(/_/g, " "));

function changes(o: Record<string, unknown>, n: Record<string, unknown>) {
  return Object.keys(n)
    .filter((k) => !SKIP.has(k) && JSON.stringify(o[k]) !== JSON.stringify(n[k]))
    .map((k) => `${k.replace(/_/g, " ")}: ${v(o[k])} → ${v(n[k])}`);
}

/**
 * Turns a log row into a readable sentence.
 * codes: id → document code (Q-1001 / 1001-1) for quotations and invoices.
 * Returns null for rows with nothing a person would care about (automatic recalculations).
 */
export function describe(r: ActivityRow, codes: Record<string, string>): Described | null {
  const n = r.new_data || {};
  const o = r.old_data || {};
  const d = r.action === "delete" ? o : n;

  switch (r.table_name) {
    case "session":
      return r.action === "login"
        ? { icon: "🔑", color: "#06b6d4", text: "Logged in", group: "session" }
        : { icon: "🚪", color: "#64748b", text: "Logged out", group: "session" };

    case "users": {
      const who = `${d.full_name || d.username} (${d.username})`;
      const map: Record<string, string> = {
        user_created: `Created user ${who} as ${roleLabel(String(d.role))}`,
        user_added: `Gave ${who} access to this company as ${roleLabel(String(d.role))}`,
        password_changed: `Changed the password of ${who}`,
        user_disabled: `Disabled ${who}`,
        user_enabled: `Enabled ${who}`,
        role_changed: `Changed ${who} from ${roleLabel(String(d.from))} to ${roleLabel(String(d.to))}`,
      };
      return { icon: "👤", color: "#8b5cf6", text: map[r.action] || `User ${r.action}`, group: "users" };
    }

    case "companies": {
      if (r.action === "insert") return { icon: "🏢", color: "#2563eb", text: `Created company ${d.name}`, group: "company" };
      const c = changes(o, n);
      return c.length ? { icon: "🏢", color: "#2563eb", text: `Company details changed. ${c.join(", ")}`, group: "company" } : null;
    }

    case "clients": {
      if (r.action === "insert") return { icon: "🤝", color: "#0ea5e9", text: `Added client ${d.name}`, group: "clients" };
      if (r.action === "delete") return { icon: "🤝", color: "#0ea5e9", text: `Deleted client ${d.name}`, group: "clients" };
      const c = changes(o, n);
      return c.length ? { icon: "🤝", color: "#0ea5e9", text: `Client ${n.name} changed. ${c.join(", ")}`, group: "clients" } : null;
    }

    case "quotations": {
      const code = String(d.code || codes[r.record_id] || "quotation");
      const href = r.action === "delete" ? undefined : `/quotations/${r.record_id}`;
      if (r.action === "insert") return { icon: "📄", color: "#2563eb", text: `Created quotation ${code}${d.project_name ? ` (${d.project_name})` : ""}`, href, group: "quotations" };
      if (r.action === "delete") return { icon: "🗑️", color: "#e11d48", text: `Deleted quotation ${code}`, group: "quotations" };
      if (o.status !== n.status) return { icon: "📄", color: "#2563eb", text: `Quotation ${code}: status ${v(o.status)} → ${v(n.status)}`, href, group: "quotations" };
      const c = changes(o, n);
      return c.length ? { icon: "✏️", color: "#2563eb", text: `Edited quotation ${code}. ${c.join(", ")}`, href, group: "quotations" } : null;
    }

    case "quotation_items":
    case "invoice_items": {
      const parentKey = r.table_name === "quotation_items" ? "quotation_id" : "invoice_id";
      const pid = String(d[parentKey] || "");
      const code = codes[pid] || "";
      const href = pid ? `/${r.table_name === "quotation_items" ? "quotations" : "invoices"}/${pid}` : undefined;
      const group = r.table_name === "quotation_items" ? "quotations" : "invoices";
      if (r.action === "insert") return { icon: "➕", color: "#06b6d4", text: `${code} line: ${d.description} (${d.quantity} ${d.unit} × ${d.unit_rate})`, href, group };
      if (r.action === "delete") return { icon: "➖", color: "#94a3b8", text: `${code} line removed: ${d.description}`, href, group };
      const c = changes(o, n);
      return c.length ? { icon: "✏️", color: "#06b6d4", text: `${code} line changed. ${c.join(", ")}`, href, group } : null;
    }

    case "invoices": {
      const code = String(d.code || codes[r.record_id] || "invoice");
      const href = `/invoices/${r.record_id}`;
      if (r.action === "insert") return { icon: "🧾", color: "#8b5cf6", text: `Created ${v(d.kind)} invoice ${code}`, href, group: "invoices" };
      if (o.status !== n.status) {
        const auto = ["partially_paid", "paid"].includes(String(n.status)) && o.status !== "draft";
        if (auto) return null; // payment status changes are shown as the payment itself
        return { icon: "🧾", color: "#8b5cf6", text: `Invoice ${code}: ${v(o.status)} → ${v(n.status)}`, href, group: "invoices" };
      }
      const c = changes(o, n);
      return c.length ? { icon: "✏️", color: "#8b5cf6", text: `Edited invoice ${code}. ${c.join(", ")}`, href, group: "invoices" } : null;
    }

    case "payments": {
      const code = codes[String(d.invoice_id)] || "";
      const href = d.invoice_id ? `/invoices/${d.invoice_id}` : undefined;
      if (r.action === "insert")
        return { icon: "💰", color: "#10b981", text: `Recorded payment ${Number(d.amount).toFixed(3)} on invoice ${code} (${v(d.method)})`, href, group: "payments" };
      if (r.action === "delete") return { icon: "💸", color: "#e11d48", text: `Deleted payment ${Number(d.amount).toFixed(3)} from invoice ${code}`, href, group: "payments" };
      return { icon: "💰", color: "#10b981", text: `Payment on invoice ${code} changed`, href, group: "payments" };
    }

    case "attachments": {
      const pid = String(d.quotation_id || d.invoice_id || "");
      const code = codes[pid] || "";
      const href = d.quotation_id ? `/quotations/${d.quotation_id}` : d.invoice_id ? `/invoices/${d.invoice_id}` : undefined;
      if (r.action === "insert") return { icon: "📎", color: "#f59e0b", text: `Uploaded ${d.file_name} to ${code}`, href, group: "files" };
      if (r.action === "delete") return { icon: "📎", color: "#e11d48", text: `Deleted file ${d.file_name} from ${code}`, href, group: "files" };
      return null;
    }
  }
  return { icon: "•", color: "#64748b", text: `${r.table_name} ${r.action}`, group: "other" };
}

// ids of quotations/invoices mentioned in the rows (to look up their codes)
export function referencedIds(rows: ActivityRow[]) {
  const q = new Set<string>();
  const i = new Set<string>();
  rows.forEach((r) => {
    const d = { ...(r.old_data || {}), ...(r.new_data || {}) };
    if (r.table_name === "quotations") q.add(r.record_id);
    if (r.table_name === "invoices") i.add(r.record_id);
    if (d.quotation_id) q.add(String(d.quotation_id));
    if (d.invoice_id) i.add(String(d.invoice_id));
  });
  return { quotationIds: [...q], invoiceIds: [...i] };
}
