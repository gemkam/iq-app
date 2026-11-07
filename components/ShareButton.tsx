"use client";
import { useState } from "react";
import { money } from "@/lib/format";

// Share a read-only link to a quotation or invoice. The person who opens it does not need a login.
export default function ShareButton({
  token,
  title,
  clientName,
  total,
  mobile,
  disabledReason,
}: {
  token: string;
  title: string; // e.g. "Quotation Q-1001"
  clientName?: string | null;
  total: number;
  mobile?: string | null;
  disabledReason?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const url = typeof window !== "undefined" ? `${window.location.origin}/share/${token}` : "";
  const text = `${title}${clientName ? ` for ${clientName}` : ""}\nTotal: ${money(total)}\nView and download: ${url}`;
  const phone = (mobile || "").replace(/[^0-9]/g, "");
  const waNumber = phone.length === 8 ? `968${phone}` : phone; // Omani local number -> add country code

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

  return (
    <div className="relative">
      <button className="btn-accent" onClick={() => setOpen(!open)}>Share</button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-64 space-y-1 rounded-xl border border-slate-200 bg-white p-2 text-sm shadow-lg">
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
              <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-50" onClick={nativeShare}>
                <span className="text-lg">📤</span> More apps (email, Telegram...)
              </button>
            )}
            <a
              className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-slate-50"
              href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`}
            >
              <span className="text-lg">✉️</span> Email
            </a>
            <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-50" onClick={copy}>
              <span className="text-lg">🔗</span> {copied ? "Link copied!" : "Copy link"}
            </button>
            <p className="px-3 pt-1 text-[11px] text-slate-500">
              The client opens a read-only page and can print or save it as PDF. No login needed.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
