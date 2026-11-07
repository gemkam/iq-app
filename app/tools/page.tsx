"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useMe } from "@/components/AuthGate";
import Explain from "@/components/Explain";
import { TOOLS } from "@/components/ConversionsMenu";
import { downloadFile } from "@/lib/pdf";
import { subStatus } from "@/lib/subscription";

type ToolId = (typeof TOOLS)[number]["id"];

const INFO: Record<ToolId, { accept: string; multiple: boolean; hint: string }> = {
  "word-pdf": { accept: ".docx", multiple: false, hint: "Choose a Word file (.docx). Text, headings, lists, tables and pictures are kept." },
  "pdf-word": { accept: "application/pdf,.pdf", multiple: false, hint: "Choose a PDF. The text is copied into an editable Word file (layout is simplified)." },
  "excel-pdf": { accept: ".xlsx", multiple: false, hint: "Choose an Excel file (.xlsx). Each sheet becomes a table in the PDF." },
  "pdf-excel": { accept: "application/pdf,.pdf", multiple: false, hint: "Choose a PDF. Each line becomes a row, columns are split where there are gaps. One sheet per page." },
  "img-pdf": { accept: "image/*", multiple: true, hint: "Choose one or more photos (JPG, PNG, WEBP…). Each photo becomes one A4 page, in the order you pick them." },
  "pdf-img": { accept: "application/pdf,.pdf", multiple: false, hint: "Choose a PDF. Each page becomes a PNG picture (several pages come in one .zip)." },
  merge: { accept: "application/pdf,.pdf", multiple: true, hint: "Choose the PDFs to join. They are joined in the order shown; use ↑ ↓ to change it." },
  split: { accept: "application/pdf,.pdf", multiple: false, hint: "Choose a PDF, then pick how many PDFs you want. Pages are shared out evenly." },
};

export default function ToolsPage() {
  return (
    <Suspense>
      <Tools />
    </Suspense>
  );
}

function Tools() {
  const params = useSearchParams();
  const router = useRouter();
  const { me, isAdmin } = useMe();
  const initial = (TOOLS.find((t) => t.id === params.get("t"))?.id || "word-pdf") as ToolId;
  const [tool, setTool] = useState<ToolId>(initial);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pages, setPages] = useState<number | null>(null);
  const [parts, setParts] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // Plan limits: free trial (or ended) → merge up to 3, split into 2 or 3. Paid → merge unlimited, split up to 10.
  const state = subStatus(me?.sub).state;
  const full = isAdmin || state === "paid" || state === "unlimited";
  const mergeMax = full ? Infinity : 3;
  const splitMax = full ? 10 : 3;

  useEffect(() => {
    setFiles([]);
    setMsg(null);
    setPages(null);
    setParts(null);
    if (input.current) input.current.value = "";
  }, [tool]);

  // For split: read the page count so we know which choices make sense
  useEffect(() => {
    if (tool !== "split" || !files[0]) return;
    setPages(null);
    setParts(null);
    import("@/lib/convert").then((c) =>
      c.pdfPageCount(files[0]).then(setPages, () => setMsg({ ok: false, text: "This PDF could not be read." }))
    );
  }, [tool, files]);

  const info = INFO[tool];
  const choose = (t: ToolId) => {
    setTool(t);
    router.replace(`/tools?t=${t}`);
  };

  const pick = (list: FileList | null) => {
    if (!list) return;
    setMsg(null);
    let next = info.multiple ? [...files, ...Array.from(list)] : Array.from(list).slice(0, 1);
    if (tool === "merge" && next.length > mergeMax) {
      next = next.slice(0, mergeMax);
      setMsg({ ok: false, text: `The free trial can merge up to ${mergeMax} PDFs at a time. Upgrade to the full version to merge any number.` });
    }
    setFiles(next);
    if (input.current) input.current.value = "";
  };

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= files.length) return;
    const a = [...files];
    [a[i], a[j]] = [a[j], a[i]];
    setFiles(a);
  };

  const ready =
    files.length > 0 && (tool !== "merge" || files.length >= 2) && (tool !== "split" || (parts !== null && pages !== null && parts <= pages));

  const go = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const c = await import("@/lib/convert");
      let out: File;
      switch (tool) {
        case "word-pdf": out = await c.wordToPdf(files[0]); break;
        case "pdf-word": out = await c.pdfToWord(files[0]); break;
        case "excel-pdf": out = await c.excelToPdf(files[0]); break;
        case "pdf-excel": out = await c.pdfToExcel(files[0]); break;
        case "img-pdf": out = await c.imagesToPdf(files); break;
        case "pdf-img": out = await c.pdfToImages(files[0]); break;
        case "merge": out = await c.mergePdfs(files); break;
        case "split": out = await c.splitPdf(files[0], parts!); break;
      }
      downloadFile(out);
      setMsg({ ok: true, text: `Done ✓ ${out.name} downloaded.` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message || "Could not convert this file." });
    } finally {
      setBusy(false);
    }
  };

  const splitChoices = Array.from({ length: splitMax - 1 }, (_, i) => i + 2);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">🔄 Conversions</h1>
        <p className="text-sm text-slate-500">Convert, merge and split files. Files stay on your device; nothing is uploaded.</p>
      </div>

      <Explain title="Your plan">
        {full ? (
          <p>Full version: merge any number of PDFs and split a PDF into up to 10 PDFs.</p>
        ) : (
          <p>Free trial: merge up to <b>3</b> PDFs at a time and split a PDF into <b>2 or 3</b> PDFs. The full version merges any number and splits into up to 10.</p>
        )}
      </Explain>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => choose(t.id)}
            className={`rounded-xl border p-3 text-left text-sm font-semibold transition ${
              tool === t.id ? "border-blue-600 bg-blue-600 text-white shadow" : "border-slate-200 bg-white hover:border-blue-400"
            }`}
          >
            <span className="mr-1 text-lg">{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      <div className="card space-y-3 p-4">
        <p className="text-sm text-slate-600">{info.hint}</p>

        <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 p-6 text-center hover:border-blue-500">
          <span className="text-3xl">📂</span>
          <span className="font-semibold">{info.multiple && files.length ? "Add more files" : "Choose file"}{info.multiple ? "s" : ""}</span>
          {tool === "merge" && !full && <span className="text-xs text-slate-500">Trial: up to 3 PDFs</span>}
          <input ref={input} type="file" className="hidden" accept={info.accept} multiple={info.multiple} onChange={(e) => pick(e.target.files)} />
        </label>

        {files.length > 0 && (
          <ul className="space-y-1 text-sm">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <span className="w-5 text-slate-400">{i + 1}.</span>
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="text-xs text-slate-400">{(f.size / 1024).toFixed(0)} KB</span>
                {info.multiple && (
                  <>
                    <button className="px-1" onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                    <button className="px-1" onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                  </>
                )}
                <button className="px-1 text-red-600" onClick={() => setFiles(files.filter((_, k) => k !== i))} aria-label="Remove">✕</button>
              </li>
            ))}
          </ul>
        )}

        {tool === "merge" && files.length === 1 && <p className="text-xs text-slate-500">Add at least one more PDF to merge.</p>}

        {tool === "split" && files[0] && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            {pages === null ? (
              <p>Reading pages…</p>
            ) : pages < 2 ? (
              <p>This PDF has only 1 page, so it cannot be split.</p>
            ) : (
              <>
                <p className="mb-2 font-semibold">This PDF has {pages} pages. How many PDFs do you need?</p>
                <div className="flex flex-wrap gap-2">
                  {splitChoices.map((n) => (
                    <button
                      key={n}
                      disabled={n > pages}
                      onClick={() => setParts(n)}
                      className={`h-10 min-w-10 rounded-lg border px-3 font-bold disabled:opacity-30 ${
                        parts === n ? "border-blue-600 bg-blue-600 text-white" : "border-blue-300 bg-blue-100 text-blue-900"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                {!full && <p className="mt-2 text-xs">Free trial: 2 or 3 PDFs. The full version splits into up to 10.</p>}
                {parts && (
                  <SplitPreview pages={pages} parts={parts} />
                )}
              </>
            )}
          </div>
        )}

        <button className="btn-primary w-full" disabled={!ready || busy} onClick={go}>
          {busy ? "Working…" : tool === "split" && parts ? `Split into ${parts} PDFs` : "Convert & download"}
        </button>
        {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}
      </div>

      <Explain title="Good to know">
        <p>PDF to Word and PDF to Excel copy the text of the PDF. Scanned PDFs (photos of paper) have no text, so they come out empty.</p>
        <p>Old .doc and .xls files are not supported. Open them and save as .docx or .xlsx first.</p>
        <p>To convert one of your quotations or invoices, open it and use 🔄 Conversions there.</p>
      </Explain>
    </div>
  );
}

function SplitPreview({ pages, parts }: { pages: number; parts: number }) {
  const [ranges, setRanges] = useState<[number, number][]>([]);
  useEffect(() => {
    import("@/lib/convert").then((c) => setRanges(c.splitRanges(pages, parts)));
  }, [pages, parts]);
  return (
    <ul className="mt-2 space-y-0.5 text-xs">
      {ranges.map(([a, b], i) => (
        <li key={i}>PDF {i + 1}: page{a === b ? ` ${a}` : `s ${a}–${b}`}</li>
      ))}
    </ul>
  );
}
