"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useMe } from "@/components/AuthGate";
import { useCompany } from "@/lib/useCompany";
import Explain from "@/components/Explain";
import PrintDoc from "@/components/PrintDoc";
import { DEFAULT_UNITS } from "@/lib/units";
import { COLOR_PRESETS, DEFAULT_TEMPLATE, templateOf, type PdfTemplate } from "@/lib/pdfTemplate";
import type { Item } from "@/lib/types";

const SAMPLE_ITEMS: Item[] = [
  { sort_order: 1, description: "Interior wall painting, 2 coats emulsion", quantity: 120, unit: "sqm", unit_rate: 2.5, amount: 300 },
  { sort_order: 2, description: "Gypsum false ceiling with frame", quantity: 45, unit: "sqm", unit_rate: 8.75, amount: 393.75 },
  { sort_order: 3, description: "Site supervisor", quantity: 5, unit: "days", unit_rate: 25, amount: 125 },
  { sort_order: 4, description: "Material transport and cleaning", quantity: 1, unit: "ls", unit_rate: 60, amount: 60 },
];

const STYLES: { key: PdfTemplate["style"]; name: string; text: string }[] = [
  { key: "classic", name: "Classic", text: "White header, colored line" },
  { key: "modern", name: "Modern", text: "Gradient header band" },
  { key: "bold", name: "Bold", text: "Solid color header" },
  { key: "minimal", name: "Minimal", text: "Clean, thin lines" },
];

const SHOW_GROUPS: { title: string; keys: [keyof PdfTemplate["show"], string][] }[] = [
  {
    title: "Header",
    keys: [
      ["name_ar", "Arabic name"],
      ["cr", "CR number"],
      ["vatin", "VAT number"],
      ["address", "Address"],
      ["phone", "Phone"],
      ["email", "Email"],
    ],
  },
  {
    title: "Table columns",
    keys: [
      ["sno", "S.No"],
      ["unit", "Unit"],
      ["rate", "Rate"],
    ],
  },
  {
    title: "Sections",
    keys: [
      ["notes", "Notes"],
      ["terms", "Terms & conditions"],
      ["bank", "Bank details"],
      ["signatures", "Signature lines"],
      ["watermark", "Watermark"],
    ],
  },
];

export default function Design() {
  const { me } = useMe();
  const { company, reload } = useCompany();
  const [t, setT] = useState<PdfTemplate>(DEFAULT_TEMPLATE);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [docType, setDocType] = useState<"quotation" | "invoice">("quotation");
  const canDesign = me?.role === "admin" || me?.role === "owner";

  useEffect(() => {
    if (company && !loaded) {
      setT(templateOf(company));
      setLoaded(true);
    }
  }, [company, loaded]);

  const set = <K extends keyof PdfTemplate>(k: K, v: PdfTemplate[K]) => setT((p) => ({ ...p, [k]: v }));
  const setShow = (k: keyof PdfTemplate["show"], v: boolean) => setT((p) => ({ ...p, show: { ...p.show, [k]: v } }));
  const setBank = (k: keyof PdfTemplate["bank"], v: string) => setT((p) => ({ ...p, bank: { ...p.bank, [k]: v } }));

  const upload = async (file: File | undefined, field: "logo_url" | "stamp_url" | "signature_url") => {
    if (!file || !company) return;
    setMsg(null);
    if (file.size > 2 * 1024 * 1024) return setMsg({ ok: false, text: "Image must be smaller than 2 MB." });
    setBusy(field);
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${company.id}/${field.replace("_url", "")}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("branding").upload(path, file, { contentType: file.type, upsert: true });
    setBusy(null);
    if (error) return setMsg({ ok: false, text: error.message });
    const { data } = supabase.storage.from("branding").getPublicUrl(path);
    set(field, data.publicUrl);
  };

  const save = async () => {
    if (!company) return;
    setBusy("save");
    setMsg(null);
    const { error } = await supabase.rpc("save_pdf_template", { p_company: company.id, p_template: t });
    setBusy(null);
    if (error) setMsg({ ok: false, text: error.message });
    else {
      setMsg({ ok: true, text: "Design saved. All quotations, invoices, shared links and PDFs now use it." });
      reload();
    }
  };

  if (!company) return <p className="text-slate-500">Loading...</p>;
  if (!canDesign) return <div className="card p-6 text-center text-slate-500">Only administrators and company owners can change the PDF design.</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">PDF design</h1>
          <p className="text-sm text-slate-500">{company.name}: how quotations and invoices look when printed, shared or sent as PDF</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-light" onClick={() => confirm("Reset all design settings to default?") && setT({ ...DEFAULT_TEMPLATE, logo_url: t.logo_url })}>
            Reset
          </button>
          <button className="btn-accent" disabled={busy === "save"} onClick={save}>
            {busy === "save" ? "Saving..." : "Save design"}
          </button>
        </div>
      </div>
      {msg && <p className={`rounded-lg p-3 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        {/* ================= Controls ================= */}
        <div className="space-y-4">
          <Explain>
            <p>Change anything on the left and the preview updates straight away. Press <b>Save design</b> to use it on every quotation and invoice of this company.</p>
          </Explain>

          <Panel title="Style">
            <div className="grid grid-cols-2 gap-2">
              {STYLES.map((st) => (
                <button
                  key={st.key}
                  onClick={() => set("style", st.key)}
                  className={`overflow-hidden rounded-xl border text-left text-xs ${t.style === st.key ? "border-blue-500 ring-2 ring-blue-500/40" : "border-slate-200"}`}
                >
                  <StyleThumb style={st.key} primary={t.primary} accent={t.accent} />
                  <span className="block px-2 pt-1 font-bold">{st.name}</span>
                  <span className="block px-2 pb-2 text-slate-500">{st.text}</span>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Colors">
            <div className="grid grid-cols-4 gap-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c.name}
                  title={c.name}
                  onClick={() => setT((p) => ({ ...p, primary: c.primary, accent: c.accent }))}
                  className={`h-10 rounded-lg border ${t.primary === c.primary && t.accent === c.accent ? "ring-2 ring-blue-500" : "border-slate-200"}`}
                  style={{ background: `linear-gradient(135deg, ${c.primary} 55%, ${c.accent} 55%)` }}
                />
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <ColorField label="Main color" value={t.primary} onChange={(v) => set("primary", v)} />
              <ColorField label="Accent color" value={t.accent} onChange={(v) => set("accent", v)} />
            </div>
          </Panel>

          <Panel title="Font">
            <div className="grid grid-cols-3 gap-2">
              {(["sans", "serif", "rounded"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => set("font", f)}
                  className={`rounded-lg border px-2 py-2 text-sm capitalize ${t.font === f ? "border-blue-500 bg-blue-500/10 font-bold" : "border-slate-200"}`}
                  style={{ fontFamily: f === "serif" ? "Georgia, serif" : f === "rounded" ? '"Trebuchet MS", sans-serif' : undefined }}
                >
                  {f === "sans" ? "Modern" : f === "serif" ? "Classic" : "Friendly"}
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Logo">
            <ImageField label="Company logo" url={t.logo_url} busy={busy === "logo_url"} onPick={(f) => upload(f, "logo_url")} onClear={() => set("logo_url", "")} />
            <label className="lbl mt-3">Size: {t.logo_size}px</label>
            <input type="range" min={36} max={120} value={t.logo_size} onChange={(e) => set("logo_size", Number(e.target.value))} className="w-full" />
            <label className="lbl mt-2">Position</label>
            <div className="grid grid-cols-3 gap-2">
              {(["left", "center", "right"] as const).map((p) => (
                <button key={p} onClick={() => set("logo_pos", p)} className={`rounded-lg border py-1.5 text-sm capitalize ${t.logo_pos === p ? "border-blue-500 bg-blue-500/10 font-bold" : "border-slate-200"}`}>
                  {p}
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Show or hide">
            {SHOW_GROUPS.map((g) => (
              <div key={g.title} className="mb-3 last:mb-0">
                <p className="lbl">{g.title}</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {g.keys.map(([k, label]) => (
                    <label key={k} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="h-4 w-4" checked={t.show[k]} onChange={(e) => setShow(k, e.target.checked)} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </Panel>

          <Panel title="Document titles">
            <Field label="Quotation title" value={t.quotation_title} onChange={(v) => set("quotation_title", v)} />
            <Field label="Invoice title" value={t.invoice_title} onChange={(v) => set("invoice_title", v)} />
            <Field label="Tax invoice title (VAT registered)" value={t.tax_invoice_title} onChange={(v) => set("tax_invoice_title", v)} />
            <p className="text-xs text-slate-500">Arabic works too, for example: عرض سعر / QUOTATION</p>
          </Panel>

          {t.show.bank && (
            <Panel title="Bank details">
              <Field label="Bank name" value={t.bank.name} onChange={(v) => setBank("name", v)} />
              <Field label="Account name" value={t.bank.holder} onChange={(v) => setBank("holder", v)} />
              <Field label="Account number" value={t.bank.account} onChange={(v) => setBank("account", v)} />
              <Field label="IBAN" value={t.bank.iban} onChange={(v) => setBank("iban", v)} />
            </Panel>
          )}

          {t.show.signatures && (
            <Panel title="Signature and stamp">
              <Field label="Left signature label" value={t.sign_left} onChange={(v) => set("sign_left", v)} />
              <Field label="Right signature label" value={t.sign_right} onChange={(v) => set("sign_right", v)} />
              <p className="mb-3 text-xs text-slate-500">{"{company}"} is replaced by the company name.</p>
              <ImageField label="Signature image (PNG with transparent background works best)" url={t.signature_url} busy={busy === "signature_url"} onPick={(f) => upload(f, "signature_url")} onClear={() => set("signature_url", "")} />
              <div className="h-3" />
              <ImageField label="Company stamp" url={t.stamp_url} busy={busy === "stamp_url"} onPick={(f) => upload(f, "stamp_url")} onClear={() => set("stamp_url", "")} />
            </Panel>
          )}

          <Panel title="Footer">
            <textarea className="input" rows={2} value={t.footer_text} onChange={(e) => set("footer_text", e.target.value)} placeholder="e.g. Thank you for your business · www.yourcompany.om" />
          </Panel>

          <button className="btn-accent w-full py-3" disabled={busy === "save"} onClick={save}>
            {busy === "save" ? "Saving..." : "Save design"}
          </button>
        </div>

        {/* ================= Live preview ================= */}
        <div className="lg:sticky lg:top-28 lg:self-start">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-bold">Live preview</p>
            <div className="flex gap-1 text-sm">
              {(["quotation", "invoice"] as const).map((d) => (
                <button key={d} onClick={() => setDocType(d)} className={`rounded-lg px-3 py-1 capitalize ${docType === d ? "bg-blue-600 text-white" : "btn-light !py-1"}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          <ScaledPreview>
            <PrintDoc
              bare
              template={t}
              company={company}
              title={docType === "quotation" ? "QUOTATION" : company.vat_registered ? "TAX INVOICE" : "INVOICE"}
              number={docType === "quotation" ? "Q-1001" : "1001"}
              docDate={new Date().toISOString()}
              billTo={{ name: "Sample Client LLC", attention: "Mr. Ahmed Al Balushi", mobile: "+968 9123 4567" }}
              meta={[
                { k: "Project", v: "Villa renovation" },
                { k: "Location", v: "Al Khuwair, Muscat" },
                { k: docType === "quotation" ? "Valid for" : "Due date", v: docType === "quotation" ? "30 days" : "30 days from invoice" },
              ]}
              items={SAMPLE_ITEMS}
              units={DEFAULT_UNITS}
              totals={[
                { k: "Subtotal", v: 878.75 },
                { k: "VAT 5%", v: 43.938 },
                { k: "TOTAL", v: 922.688, bold: true },
              ]}
              notes="Work starts within 3 days of the advance payment."
              terms={company.default_terms || "1. Prices are in Omani Rial (OMR)."}
            />
          </ScaledPreview>
        </div>
      </div>
    </div>
  );
}

/* ---------- small pieces ---------- */

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <h2 className="mb-3 font-bold">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-3">
      <label className="lbl">{label}</label>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="lbl">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-12 cursor-pointer rounded-lg border border-slate-300 bg-transparent" />
        <input className="input font-mono text-xs" value={value} onChange={(e) => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && onChange(e.target.value)} />
      </div>
    </div>
  );
}

function ImageField({ label, url, busy, onPick, onClear }: { label: string; url: string; busy: boolean; onPick: (f: File | undefined) => void; onClear: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="lbl">{label}</p>
      <div className="flex items-center gap-3">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-white">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-full w-full object-contain" />
          ) : (
            <span className="text-xl text-slate-300">🖼️</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-light" disabled={busy} onClick={() => ref.current?.click()}>
            {busy ? "Uploading..." : url ? "Change" : "Upload"}
          </button>
          {url && (
            <button className="btn-light text-rose-600" onClick={onClear}>
              Remove
            </button>
          )}
        </div>
        <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
      </div>
    </div>
  );
}

function StyleThumb({ style, primary, accent }: { style: PdfTemplate["style"]; primary: string; accent: string }) {
  const head =
    style === "modern"
      ? { background: `linear-gradient(120deg, ${primary}, ${accent})` }
      : style === "bold"
        ? { background: primary }
        : { background: "#fff", borderBottom: style === "minimal" ? "1px solid #cbd5e1" : `3px solid ${primary}` };
  return (
    <div className="h-20 bg-white p-2">
      <div className="h-6 rounded-sm" style={head} />
      <div className="mt-1.5 h-2 w-2/3 rounded-sm bg-slate-200" />
      <div className="mt-1.5 h-3 rounded-sm" style={{ background: style === "minimal" ? "#e2e8f0" : primary }} />
      <div className="mt-1 h-1.5 rounded-sm bg-slate-100" />
      <div className="mt-1 h-1.5 rounded-sm bg-slate-100" />
    </div>
  );
}

// Shows the A4 page (800px wide) scaled down to fit the screen
function ScaledPreview({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [h, setH] = useState(1100);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setScale(Math.min(1, el.clientWidth / 800));
      if (inner.current) setH(inner.current.scrollHeight);
    });
    ro.observe(el);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={box} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl" style={{ height: h * scale }}>
      <div ref={inner} style={{ width: 800, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {children}
      </div>
    </div>
  );
}
