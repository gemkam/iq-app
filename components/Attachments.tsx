"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { dateTime } from "@/lib/format";
import Explain from "./Explain";
import { ACCEPT, fileSize as size, uploadFiles } from "@/lib/attachments";

type Att = {
  id: string;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

const isImage = (a: Att) => (a.mime_type || "").startsWith("image/") && !/heic|heif/i.test(a.mime_type || "");
const icon = (a: Att) => {
  const n = a.file_name.toLowerCase();
  if (n.endsWith(".pdf")) return "📕";
  if (/\.(docx?|txt)$/.test(n)) return "📘";
  if (/\.(xlsx?|csv)$/.test(n)) return "📗";
  return "🖼️";
};

export default function Attachments({
  companyId,
  quotationId,
  invoiceId,
}: {
  companyId: string;
  quotationId?: string;
  invoiceId?: string;
}) {
  const [items, setItems] = useState<Att[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const q = supabase.from("attachments").select("*").order("created_at", { ascending: false });
    const { data } = await (quotationId ? q.eq("quotation_id", quotationId) : q.eq("invoice_id", invoiceId as string));
    const list = (data as Att[]) || [];
    setItems(list);
    if (list.length) {
      const { data: signed } = await supabase.storage.from("attachments").createSignedUrls(
        list.map((a) => a.file_path),
        60 * 60
      );
      const m: Record<string, string> = {};
      (signed || []).forEach((s) => s.path && s.signedUrl && (m[s.path] = s.signedUrl));
      setUrls(m);
    }
  }, [quotationId, invoiceId]);

  useEffect(() => {
    load();
  }, [load]);

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setErr(null);
    setBusy(true);
    const problems = await uploadFiles(companyId, { quotationId, invoiceId }, Array.from(files));
    setBusy(false);
    if (problems.length) setErr(problems.join("\n"));
    if (fileRef.current) fileRef.current.value = "";
    if (camRef.current) camRef.current.value = "";
    load();
  };

  const remove = async (a: Att) => {
    if (!confirm(`Delete ${a.file_name}?`)) return;
    await supabase.storage.from("attachments").remove([a.file_path]);
    await supabase.from("attachments").delete().eq("id", a.id);
    load();
  };

  const shareFile = async (a: Att) => {
    const url = urls[a.file_path];
    if (!url) return;
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], a.file_name, { type: a.mime_type || blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: a.file_name });
        return;
      }
    } catch {
      /* fall back to opening */
    }
    window.open(url, "_blank");
  };

  return (
    <div className="card no-print space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">Attachments {items.length > 0 && <span className="text-slate-400">({items.length})</span>}</h3>
        <div className="flex gap-2">
          <button className="btn-light" disabled={busy} onClick={() => camRef.current?.click()}>📷 Take photo</button>
          <button className="btn-primary" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? "Uploading..." : "⬆ Upload files"}
          </button>
        </div>
        <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => upload(e.target.files)} />
        <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => upload(e.target.files)} />
      </div>

      <Explain>
        <p>Attach site photos, drawings, LPOs, signed copies, receipts and so on. Allowed: <b>PDF, all photo types (JPG, PNG, HEIC, WEBP...), Word, Excel</b>. Max 10 MB per file. You can pick several files at once.</p>
        <p>Files are private: only logged-in users of your company can open them. Tap a file to open, or use Share to send it.</p>
      </Explain>

      {err && <p className="whitespace-pre-wrap rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>}
      {items.length === 0 && <p className="text-sm text-slate-500">No files attached yet.</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((a) => {
          const url = urls[a.file_path];
          return (
            <div key={a.id} className="overflow-hidden rounded-lg border border-slate-200">
              <a href={url} target="_blank" rel="noreferrer" className="block h-28 bg-slate-50">
                {isImage(a) && url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={a.file_name} className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full place-items-center text-4xl">{icon(a)}</span>
                )}
              </a>
              <div className="space-y-1 p-2">
                <p className="truncate text-xs font-medium" title={a.file_name}>{a.file_name}</p>
                <p className="text-[11px] text-slate-400">{size(a.size_bytes)} · {dateTime(a.created_at)}</p>
                <div className="flex justify-between text-xs">
                  <button className="text-sky-700" onClick={() => shareFile(a)}>Share</button>
                  <button className="text-red-600" onClick={() => remove(a)}>Delete</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
