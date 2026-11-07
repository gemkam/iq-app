"use client";
import Omr, { OmrSign } from "@/components/Omr";
import { useEffect, useMemo, useRef, useState } from "react";
import { ACCEPT, MAX_FILE, fileSize, uploadFiles } from "@/lib/attachments";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { calcTotals, num } from "@/lib/format";
import type { Client, Company, DiscountType, Item, Quotation, Unit } from "@/lib/types";
import Explain, { Calc } from "./Explain";
import { useMe } from "./AuthGate";

const today = () => new Date().toISOString().slice(0, 10);
const blankItem = (n: number): Item => ({ sort_order: n, description: "", quantity: 1, unit: "sqm", unit_rate: 0 });

export default function QuotationForm({
  company,
  quotation,
  initialItems,
  onSaved,
}: {
  company: Company;
  quotation?: Quotation;
  initialItems?: Item[];
  onSaved?: () => void;
}) {
  const router = useRouter();
  const { isGuest } = useMe();
  const converted = quotation?.status === "converted";
  const locked = converted || isGuest;
  const [units, setUnits] = useState<Unit[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [f, setF] = useState({
    client_name: quotation?.clients?.name || "",
    project_name: quotation?.project_name || "",
    project_code: quotation?.project_code || "",
    location: quotation?.location || "",
    attention_to: quotation?.attention_to || "",
    mobile: quotation?.mobile || "",
    quote_date: quotation?.quote_date || today(),
    validity_days: quotation?.validity_days ?? company.default_validity_days ?? 30,
    discount_type: (quotation?.discount_type || "none") as DiscountType,
    discount_value: quotation?.discount_value ?? 0,
    apply_vat: quotation ? Number(quotation.vat_rate) > 0 : company.vat_registered,
    notes: quotation?.notes || "",
    terms: quotation?.terms ?? company.default_terms ?? "",
  });
  const [items, setItems] = useState<Item[]>(initialItems?.length ? initialItems : [blankItem(1)]);
  // Files picked before the quotation is saved; uploaded right after the first save
  const [pending, setPending] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const addPending = (list: FileList | null) => {
    if (!list) return;
    const ok = Array.from(list).filter((f) => f.size <= MAX_FILE);
    if (ok.length < list.length) setErr("Some files are larger than 10 MB and were skipped.");
    setPending((p) => [...p, ...ok]);
    if (fileRef.current) fileRef.current.value = "";
    if (camRef.current) camRef.current.value = "";
  };

  useEffect(() => {
    supabase
      .from("units")
      .select("code,label,is_lump_sum,sort_order")
      .order("sort_order")
      .then(({ data }) => setUnits((data as Unit[]) || []));
    supabase
      .from("clients")
      .select("*")
      .eq("company_id", company.id)
      .order("name")
      .then(({ data }) => setClients((data as Client[]) || []));
  }, [company.id]);

  const vatRate = f.apply_vat ? Number(company.vat_rate) : 0;
  const t = useMemo(() => calcTotals(items, f.discount_type, Number(f.discount_value), vatRate), [items, f.discount_type, f.discount_value, vatRate]);

  const set = (k: keyof typeof f, v: string | number | boolean) => setF((p) => ({ ...p, [k]: v }));
  const setItem = (i: number, k: keyof Item, v: string | number) =>
    setItems((p) =>
      p.map((it, idx) => {
        if (idx !== i) return it;
        const next = { ...it, [k]: v };
        if (k === "unit" && v === "ls") next.quantity = 1;
        return next;
      })
    );

  const pickClient = (name: string) => {
    set("client_name", name);
    const c = clients.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (c) {
      setF((p) => ({
        ...p,
        client_name: c.name,
        attention_to: p.attention_to || c.contact_person || "",
        mobile: p.mobile || c.mobile || "",
      }));
    }
  };

  const save = async (status?: "draft" | "submitted", share = false) => {
    setErr(null);
    if (!f.client_name.trim()) return setErr("Company name is required.");
    const valid = items.filter((i) => i.description.trim());
    if (valid.length === 0) return setErr("Add at least one item with a description.");
    setSaving(true);
    try {
      // find or create client
      let client = clients.find((c) => c.name.toLowerCase() === f.client_name.trim().toLowerCase());
      if (!client) {
        const { data, error } = await supabase
          .from("clients")
          .insert({ company_id: company.id, name: f.client_name.trim(), contact_person: f.attention_to || null, mobile: f.mobile || null })
          .select()
          .single();
        if (error) throw error;
        client = data as Client;
      }

      const header = {
        company_id: company.id,
        client_id: client.id,
        project_name: f.project_name || null,
        project_code: f.project_code || null,
        location: f.location || null,
        attention_to: f.attention_to || null,
        mobile: f.mobile || null,
        quote_date: f.quote_date,
        validity_days: Number(f.validity_days) || 30,
        discount_type: f.discount_type,
        discount_value: f.discount_type === "none" ? 0 : Number(f.discount_value) || 0,
        vat_rate: vatRate,
        notes: f.notes || null,
        terms: f.terms || null,
        ...(status ? { status } : {}),
      };

      let id = quotation?.id;
      if (id) {
        const { error } = await supabase.from("quotations").update(header).eq("id", id);
        if (error) throw error;
        const { error: delErr } = await supabase.from("quotation_items").delete().eq("quotation_id", id);
        if (delErr) throw delErr;
      } else {
        const { data, error } = await supabase.from("quotations").insert({ ...header, status: status || "draft" }).select("id").single();
        if (error) throw error;
        id = data.id as string;
      }

      const rows = valid.map((it, idx) => ({
        quotation_id: id,
        company_id: company.id,
        sort_order: idx + 1,
        description: it.description.trim(),
        quantity: it.unit === "ls" ? 1 : Number(it.quantity) || 0,
        unit: it.unit,
        unit_rate: Number(it.unit_rate) || 0,
      }));
      const { error: itemErr } = await supabase.from("quotation_items").insert(rows);
      if (itemErr) throw itemErr;

      if (!quotation && pending.length) {
        const problems = await uploadFiles(company.id, { quotationId: id }, pending);
        if (problems.length) alert(`Quotation saved, but some files did not upload:\n${problems.join("\n")}`);
      }

      if (quotation) onSaved?.();
      else router.push(`/quotations/${id}${share ? "?share=1" : ""}`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : (e as { message?: string })?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <fieldset disabled={locked || saving} className="space-y-4">
      {converted && (
        <div className="rounded-lg bg-violet-50 p-3 text-sm text-violet-800">
          This quotation has been converted to an invoice, so it is locked.
        </div>
      )}

      <div className="card grid gap-3 p-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="lbl">Company name *</label>
          <input className="input" list="clients" value={f.client_name} onChange={(e) => pickClient(e.target.value)} placeholder="Client company" />
          <datalist id="clients">
            {clients.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </div>
        <Field label="Project" value={f.project_name} onChange={(v) => set("project_name", v)} />
        <Field label="Project code" value={f.project_code} onChange={(v) => set("project_code", v)} />
        <Field label="Location" value={f.location} onChange={(v) => set("location", v)} />
        <Field label="Kind attention to" value={f.attention_to} onChange={(v) => set("attention_to", v)} />
        <Field label="Mobile number" value={f.mobile} onChange={(v) => set("mobile", v)} type="tel" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" value={f.quote_date} onChange={(v) => set("quote_date", v)} type="date" />
          <Field label="Valid (days)" value={String(f.validity_days)} onChange={(v) => set("validity_days", v)} type="number" />
        </div>
      </div>

      <div className="card p-4">
        <h3 className="mb-3 font-bold">Items</h3>
        <Explain className="mb-3">
          <p>Each line: <b>Amount = Quantity × Unit rate</b>. Example: 30 sqm × 20.000 = 600.000.</p>
          <p>Pick the unit (Square Meter, Cubic Meter, Days...). For <b>Lump Sum</b> the quantity is fixed at 1, so the rate is the full price of that line.</p>
        </Explain>
        <div className="hidden grid-cols-[40px_1fr_90px_130px_110px_110px_32px] gap-2 px-1 pb-1 text-xs font-semibold uppercase text-slate-500 md:grid">
          <span>S.No</span>
          <span>Description</span>
          <span>Qty</span>
          <span>Unit</span>
          <span>Unit rate</span>
          <span className="text-right">Amount</span>
          <span />
        </div>
        <div className="space-y-3 md:space-y-2">
          {items.map((it, i) => {
            const ls = it.unit === "ls";
            const amount = (ls ? 1 : Number(it.quantity) || 0) * (Number(it.unit_rate) || 0);
            return (
              <div
                key={i}
                className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[40px_1fr_90px_130px_110px_110px_32px] md:items-center md:border-0 md:p-1"
              >
                <span className="text-sm font-semibold text-slate-500 md:text-center">#{i + 1}</span>
                <input
                  className="input col-span-2 md:col-span-1"
                  placeholder="Description"
                  value={it.description}
                  onChange={(e) => setItem(i, "description", e.target.value)}
                />
                <div>
                  <span className="lbl md:hidden">Qty</span>
                  <input
                    className="input"
                    type="number"
                    step="any"
                    inputMode="decimal"
                    disabled={ls}
                    value={ls ? 1 : it.quantity}
                    onChange={(e) => setItem(i, "quantity", e.target.value as unknown as number)}
                  />
                </div>
                <div>
                  <span className="lbl md:hidden">Unit</span>
                  <select className="input" value={it.unit} onChange={(e) => setItem(i, "unit", e.target.value)}>
                    {units.map((u) => (
                      <option key={u.code} value={u.code}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <span className="lbl md:hidden">{ls ? "Lump sum amount" : "Unit rate"}</span>
                  <input
                    className="input"
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={it.unit_rate}
                    onChange={(e) => setItem(i, "unit_rate", e.target.value as unknown as number)}
                  />
                </div>
                <div className="text-right">
                  <span className="lbl md:hidden">Amount</span>
                  <span className="font-semibold">{num(amount)}</span>
                  {Number(it.unit_rate) > 0 && (
                    <span className="block text-[11px] text-slate-400">
                      {ls ? "Lump sum" : `${Number(it.quantity) || 0} × ${num(it.unit_rate)}`}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="col-span-2 text-sm text-red-600 md:col-span-1"
                  onClick={() => setItems((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p))}
                  title="Remove"
                >
                  <span className="md:hidden">Remove item</span>
                  <span className="hidden md:inline">✕</span>
                </button>
              </div>
            );
          })}
        </div>
        <button type="button" className="btn-light mt-3" onClick={() => setItems((p) => [...p, blankItem(p.length + 1)])}>
          + Add item
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-3 p-4">
          <div>
            <label className="lbl">Discount</label>
            <div className="flex gap-2">
              <select className="input max-w-[160px]" value={f.discount_type} onChange={(e) => set("discount_type", e.target.value)}>
                <option value="none">No discount</option>
                <option value="amount">Fixed amount</option>
                <option value="percent">Percent (%)</option>
              </select>
              {f.discount_type !== "none" && (
                <input
                  className="input"
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={f.discount_value}
                  onChange={(e) => set("discount_value", e.target.value)}
                />
              )}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={f.apply_vat} onChange={(e) => set("apply_vat", e.target.checked)} className="h-4 w-4" />
            Apply VAT {num(company.vat_rate).replace(/\.?0+$/, "")}%
          </label>
          <div>
            <label className="lbl">Notes</label>
            <textarea className="input" rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
          <div>
            <label className="lbl">Terms &amp; conditions</label>
            <textarea className="input" rows={3} value={f.terms} onChange={(e) => set("terms", e.target.value)} />
          </div>
        </div>

        <div className="card space-y-2 p-4 text-sm">
          <Row k="Subtotal" v={num(t.subtotal)} />
          {t.discount > 0 && <Row k={`Discount${f.discount_type === "percent" ? ` (${f.discount_value}%)` : ""}`} v={`- ${num(t.discount)}`} />}
          {t.discount > 0 && <Row k="After discount" v={num(t.net)} />}
          <Row k={`VAT (${vatRate}%)`} v={num(t.vat)} />
          <div className="flex justify-between border-t border-slate-200 pt-2 text-lg font-black">
            <span>Total</span>
            <Omr v={t.total} />
          </div>
          <Explain title="How the total is calculated" className="mt-3">
            <Calc label="Subtotal" formula="sum of all line amounts" result={num(t.subtotal)} />
            {f.discount_type === "amount" && <Calc label="Discount" formula="fixed amount" result={`− ${num(t.discount)}`} />}
            {f.discount_type === "percent" && (
              <Calc label="Discount" formula={`${num(t.subtotal)} × ${Number(f.discount_value) || 0}%`} result={`− ${num(t.discount)}`} />
            )}
            <Calc label="After discount" formula={`${num(t.subtotal)} − ${num(t.discount)}`} result={num(t.net)} />
            <Calc label={`VAT ${vatRate}%`} formula={`${num(t.net)} × ${vatRate}%`} result={num(t.vat)} />
            <Calc label="Total" formula={`${num(t.net)} + ${num(t.vat)}`} result={num(t.total)} />
            <p className="pt-1 text-xs">VAT is charged on the amount after discount. Tip: if the client agrees a lower price, put the difference as a fixed discount (quoted 1,000, agreed 800 → discount 200).</p>
          </Explain>
        </div>
      </div>

      {!quotation && (
        <div className="card space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold">Attachments {pending.length > 0 && <span className="text-slate-400">({pending.length})</span>}</h3>
            <div className="flex gap-2">
              <button type="button" className="btn-light" onClick={() => camRef.current?.click()}>📷 Take photo</button>
              <button type="button" className="btn-primary" onClick={() => fileRef.current?.click()}>⬆ Upload files</button>
            </div>
            <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => addPending(e.target.files)} />
            <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => addPending(e.target.files)} />
          </div>
          <Explain>
            <p>Add PDFs, photos (any type), Word or Excel files now. They upload automatically when you save the quotation. Max 10 MB per file.</p>
          </Explain>
          {pending.length === 0 && <p className="text-sm text-slate-500">No files added yet.</p>}
          {pending.map((f, i) => (
            <div key={i} className="flex items-center justify-between border-t border-slate-100 pt-2 text-sm">
              <span className="truncate">{f.type.startsWith("image/") ? "🖼️" : f.name.toLowerCase().endsWith(".pdf") ? "📕" : "📄"} {f.name} <span className="text-slate-400">{fileSize(f.size)}</span></span>
              <button type="button" className="text-xs text-red-600" onClick={() => setPending((p) => p.filter((_, idx) => idx !== i))}>Remove</button>
            </div>
          ))}
        </div>
      )}

      {err && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>}

      {!locked && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-light" onClick={() => save()}>
            {saving ? "Saving..." : quotation ? "Save changes" : "Save as draft"}
          </button>
          {(!quotation || quotation.status === "draft") && (
            <button type="button" className="btn-primary" onClick={() => save("submitted")}>
              Save &amp; mark submitted
            </button>
          )}
        </div>
      )}
    </fieldset>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="lbl">{label}</label>
      <input className="input" type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-600">{k}</span>
      <span className="font-semibold">{v}</span>
    </div>
  );
}
