"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { downloadFile, elementToPdf, safeFileName } from "@/lib/pdf";
import SharedDocView, { loadShared, type Shared } from "./SharedDocView";

type Kind = "pdf" | "word" | "excel" | "png";

// "Conversions" button on a quotation or invoice: edit as PDF, download in other formats,
// and links to the file converters (Word, Excel, PDF, images, merge, split).
export default function ConversionsMenu({
  token,
  title,
  clientName,
  disabledReason,
}: {
  token: string;
  title: string;
  clientName?: string | null;
  disabledReason?: string; // e.g. draft invoice
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Kind | null>(null);
  const [msg, setMsg] = useState("");
  const [doc, setDoc] = useState<Shared | null>(null);
  const holder = useRef<HTMLDivElement>(null);
  const want = useRef<Kind>("pdf");

  const baseName = safeFileName(`${title}${clientName ? ` ${clientName}` : ""}`);

  // Off-screen render → PDF or PNG
  useEffect(() => {
    if (!doc || (want.current !== "pdf" && want.current !== "png")) return;
    const t = setTimeout(async () => {
      try {
        const node = holder.current?.querySelector(".doc-light") as HTMLElement | null;
        if (!node) throw new Error("Document not ready");
        if (want.current === "pdf") {
          downloadFile(await elementToPdf(node, baseName + ".pdf"));
        } else {
          const { toBlob } = await import("html-to-image");
          const blob = await toBlob(node, { pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: true });
          if (!blob) throw new Error("Could not create the image");
          downloadFile(new File([blob], baseName + ".png", { type: "image/png" }));
        }
        setMsg("Downloaded ✓");
      } catch (e) {
        setMsg((e as Error).message || "Something went wrong");
      } finally {
        setDoc(null);
        setBusy(null);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [doc, baseName]);

  const run = async (k: Kind) => {
    setMsg("");
    setBusy(k);
    want.current = k;
    try {
      const d = await loadShared(token);
      if (!d) throw new Error("Could not load the document.");
      if (k === "word" || k === "excel") {
        const c = await import("@/lib/convert");
        downloadFile(k === "word" ? await c.docToWord(d) : await c.docToExcel(d));
        setMsg("Downloaded ✓");
        setBusy(null);
      } else {
        setDoc(d); // rendered off screen, then the effect above makes the file
      }
    } catch (e) {
      setMsg((e as Error).message || "Something went wrong");
      setBusy(null);
    }
  };

  const item = "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-50";
  const sub = "block text-[11px] text-slate-500";

  if (disabledReason) {
    return (
      <button className="btn-light opacity-60" onClick={() => alert(disabledReason)} title={disabledReason}>
        🔄 Conversions ▾
      </button>
    );
  }

  return (
    <div className="relative">
      <button className="btn-light" onClick={() => setOpen(!open)}>🔄 Conversions ▾</button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-40 mt-2 max-h-[75vh] w-72 sm:left-auto sm:right-0 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 text-sm shadow-xl">
            <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">This document</p>
            <Link href={`/edit-pdf/${token}`} className={item}>
              <span className="text-lg">✏️</span>
              <span><b>Edit PDF</b><span className={sub}>Change text, sign, stamp, highlight</span></span>
            </Link>
            <button className={item} disabled={!!busy} onClick={() => run("pdf")}>
              <span className="text-lg">📄</span>
              <span><b>{busy === "pdf" ? "Making PDF…" : "Download as PDF"}</b></span>
            </button>
            <button className={item} disabled={!!busy} onClick={() => run("word")}>
              <span className="text-lg">📝</span>
              <span><b>{busy === "word" ? "Making Word…" : "Download as Word"}</b><span className={sub}>.docx you can edit in Word</span></span>
            </button>
            <button className={item} disabled={!!busy} onClick={() => run("excel")}>
              <span className="text-lg">📊</span>
              <span><b>{busy === "excel" ? "Making Excel…" : "Download as Excel"}</b><span className={sub}>.xlsx with items and totals</span></span>
            </button>
            <button className={item} disabled={!!busy} onClick={() => run("png")}>
              <span className="text-lg">🖼️</span>
              <span><b>{busy === "png" ? "Making image…" : "Download as image"}</b><span className={sub}>PNG picture of the page</span></span>
            </button>
            {msg && <p className="px-3 py-1 text-xs text-emerald-700">{msg}</p>}

            <p className="mt-2 border-t border-slate-100 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Convert any file</p>
            {TOOLS.map((t) => (
              <Link key={t.id} href={`/tools?t=${t.id}`} className={item}>
                <span className="text-lg">{t.icon}</span>
                <span><b>{t.label}</b></span>
              </Link>
            ))}
          </div>
        </>
      )}

      {doc &&
        typeof document !== "undefined" &&
        createPortal(
          <div ref={holder} aria-hidden style={{ position: "fixed", left: -10000, top: 0, width: 800, background: "#fff", zIndex: -1 }}>
            <SharedDocView d={doc} bare />
          </div>,
          document.body
        )}
    </div>
  );
}

export const TOOLS = [
  { id: "word-pdf", icon: "📝", label: "Word to PDF" },
  { id: "pdf-word", icon: "📄", label: "PDF to Word" },
  { id: "excel-pdf", icon: "📊", label: "Excel to PDF" },
  { id: "pdf-excel", icon: "📄", label: "PDF to Excel" },
  { id: "img-pdf", icon: "🖼️", label: "Images to PDF" },
  { id: "pdf-img", icon: "🖼️", label: "PDF to images" },
  { id: "merge", icon: "➕", label: "Merge PDFs" },
  { id: "split", icon: "✂️", label: "Split PDF" },
] as const;
