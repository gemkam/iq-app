"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/lib/useCompany";
import type { Company } from "@/lib/types";

const FIELDS: { k: keyof Company; label: string; type?: string; full?: boolean }[] = [
  { k: "name", label: "Company name" },
  { k: "name_ar", label: "Company name (Arabic)" },
  { k: "cr_number", label: "CR number" },
  { k: "vatin", label: "VAT number (VATIN)" },
  { k: "phone", label: "Phone" },
  { k: "email", label: "Email", type: "email" },
  { k: "address", label: "Address", full: true },
  { k: "logo_url", label: "Logo URL (image link)", full: true },
  { k: "vat_rate", label: "VAT rate %", type: "number" },
  { k: "default_validity_days", label: "Quotation validity (days)", type: "number" },
];

export default function Settings() {
  const { company, reload } = useCompany();
  const [f, setF] = useState<Partial<Company>>({});
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (company) setF(company);
  }, [company]);

  if (!company) return <p className="text-slate-500">Loading...</p>;

  const save = async () => {
    setMsg(null);
    const { id: _id, ...rest } = f as Company;
    void _id;
    const payload = {
      name: rest.name,
      name_ar: rest.name_ar || null,
      cr_number: rest.cr_number || null,
      vatin: rest.vatin || null,
      phone: rest.phone || null,
      email: rest.email || null,
      address: rest.address || null,
      logo_url: rest.logo_url || null,
      vat_rate: Number(rest.vat_rate) || 0,
      vat_registered: !!rest.vat_registered,
      default_validity_days: Number(rest.default_validity_days) || 30,
      default_terms: rest.default_terms || null,
    };
    const { error } = await supabase.from("companies").update(payload).eq("id", company.id);
    if (error) setMsg(error.message);
    else {
      setMsg("Saved.");
      reload();
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Company settings</h1>
      <p className="text-sm text-slate-500">These details appear on every quotation and invoice.</p>
      <div className="card grid gap-3 p-4 sm:grid-cols-2">
        {FIELDS.map((fd) => (
          <div key={fd.k} className={fd.full ? "sm:col-span-2" : ""}>
            <label className="lbl">{fd.label}</label>
            <input
              className="input"
              type={fd.type || "text"}
              value={(f[fd.k] as string | number | null) ?? ""}
              onChange={(e) => setF({ ...f, [fd.k]: e.target.value })}
            />
          </div>
        ))}
        <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
          <input type="checkbox" className="h-4 w-4" checked={!!f.vat_registered} onChange={(e) => setF({ ...f, vat_registered: e.target.checked })} />
          VAT registered (prints TAX INVOICE and applies VAT by default)
        </label>
        <div className="sm:col-span-2">
          <label className="lbl">Default terms &amp; conditions</label>
          <textarea className="input" rows={4} value={f.default_terms || ""} onChange={(e) => setF({ ...f, default_terms: e.target.value })} />
        </div>
      </div>
      {msg && <p className="text-sm font-medium text-emerald-700">{msg}</p>}
      <button className="btn-primary" onClick={save}>Save settings</button>
    </div>
  );
}
