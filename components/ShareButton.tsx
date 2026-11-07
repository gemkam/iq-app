"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { money } from "@/lib/format";
import { downloadFile, elementToPdf, safeFileName } from "@/lib/pdf";
import SharedDocView, { loadShared, type Shared } from "./SharedDocView";

// Share a quotation or invoice: as a read-only link (no login needed) or as a PDF file.
export default function ShareButton({
  token,
  title,
  clientName,
  total,
  mobile,
  disabledReason,
  autoOpen,
}: {
  token: string;
  title: string; // e.g. "Quotation Q-1001"
  clientName?: string | null;
  total: number;
  mobile?: string | null;
  disabledReason?: string;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!autoOpen);
  const [copied, setCopied] = useState(false);
  const [pdfState, setPdfState] = useState<"idle" | "making" | "ready" | "error">("idle");
  const [pdfMsg, setPdfMsg] = useState("");
  const [doc, setDoc] = useState<Shared | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const holder = useRef<HTMLDivElement>(null);

  const url = typeof window !== "undefined" ? `${window.location.origin}/share/${token}` : "";
  const text = `${title}${clientName ? ` for ${clientName}` : ""}\nTotal: ${money(total)}\nView and download: ${url}`;
  const phone = (mobile || "").replace(/[^0-9]/g, "");
  const waNumber = phone.length === 8 ? `968${phone}` : phone; // Omani local number -> add country code
  const canShareFiles = typeof navigator !== "undefined" && "canShare" in navigator;

  // When the document is rendered off screen, turn it into a PDF
  useEffect(() => {
    if (!doc || pdfState !== "making") return;
    const t = setTimeout(async () => {
      try {
        const node = holder.current?.querySelector(".doc-light") as HTMLElement | null;
        if (!node) throw new Error("Document not ready");
        const name = safeFileName(`${title}${clientName ? ` ${clientName}` : ""}`) + ".pdf";
        const f = await elementToPdf(node, name);
        setFile(f);
        setPdfState("ready");
      } catch (e) {
        setPdfMsg((e as Error).message || "Could not create the PDF");
        setPdfState("error");
      } finally {
        setDoc(null);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [doc, pdfState, title, clientName]);

  const makePdf = async () => {
    setPdfMsg("");
    setFile(null);
    setPdfState("making");
    const d = await loadShared(token);
    if (!d) {
      setPdfMsg("Could not load the document.");
      setPdfState("error");
      return;
    }
    setDoc(d);
  };

  const sendPdf = async () => {
    if (!file) return;
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title, text: `${title}${clientName ? ` for ${clientName}` : ""}` });
        return;
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return; // user closed the share sheet
    }
    downloadFile(file);
    setPdfMsg("PDF downloaded. You can attach it in WhatsApp or email.");
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title, text, url });
    } catch {
      /* user closed the share sheet */
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("Copy this link:", url);
    }
  };

  if (disabledReason) {
    return (
      <button className="btn-light" onClick={() => alert(disabledReason)} title={disabledReason}>
        Share
      </button>
    );
  }

  const item = "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-50";

  return (
    <div className="relative">
      <button className="btn-accent" onClick={() => setOpen(!open)}>Share</button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-72 space-y-1 rounded-xl border border-slate-200 bg-white p-2 text-sm shadow-xl">
            {/* PDF */}
            <div className="rounded-lg border border-slate-200 p-2">
              {pdfState === "idle" || pdfState === "error" ? (
                <button className={item} onClick={makePdf}>
                  <span className="text-lg">📄</span>
                  <span>
                    <b>Share as PDF</b>
                    <span className="block text-[11px] text-slate-500">Creates a PDF file of this document</span>
                  </span>
                </button>
              ) : pdfState === "making" ? (
                <p className="flex items-center gap-2 px-3 py-2 text-slate-600">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" /> Creating PDF...
                </p>
              ) : (
                <div className="space-y-2 px-1 py-1">
                  <p className="truncate px-2 text-xs text-slate-500">📄 {file?.name}</p>
                  <div className="flex gap-2">
                    <button className="btn-primary flex-1" onClick={sendPdf}>
                      {canShareFiles ? "Send PDF" : "Download PDF"}
                    </button>
                    {canShareFiles && (
                      <button className="btn-light" onClick={() => file && downloadFile(file)} title="Save to this device">
                        ⬇
                      </button>
                    )}
                  </div>
                </div>
              )}
              {pdfMsg && <p className={`px-3 pb-1 text-[11px] ${pdfState === "error" ? "text-red-600" : "text-emerald-700"}`}>{pdfMsg}</p>}
            </div>

            <a href={`/edit-pdf/${token}`} className={`${item} rounded-lg border border-slate-200`}>
              <span className="text-lg">✏️</span>
              <span>
                <b>Edit PDF before sending</b>
                <span className="block text-[11px] text-slate-500">Change text, add notes, sign, stamp, highlight</span>
              </span>
            </a>

            {/* Link */}
            <p className="px-3 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Or share a link</p>
            <a
              className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-emerald-50"
              href={`https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`}
              target="_blank"
              rel="noreferrer"
            >
              <span className="text-lg">🟢</span>
              <span>
                WhatsApp {waNumber ? <span className="text-slate-500">to {mobile}</span> : <span className="text-slate-500">(choose chat)</span>}
              </span>
            </a>
            {typeof navigator !== "undefined" && "share" in navigator && (
              <button className={item} onClick={nativeShare}>
                <span className="text-lg">📤</span> More apps (email, Telegram...)
              </button>
            )}
            <a className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-slate-50" href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`}>
              <span className="text-lg">✉️</span> Email
            </a>
            <button className={item} onClick={copy}>
              <span className="text-lg">🔗</span> {copied ? "Link copied!" : "Copy link"}
            </button>
            <p className="px-3 pt-1 text-[11px] text-slate-500">The link opens a read-only page. No login needed.</p>
          </div>
        </>
      )}

      {/* Off-screen white page used to build the PDF */}
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
