"use client";
import Link from "next/link";
import { useState } from "react";
import { useMe } from "./AuthGate";
import { roleLabel } from "@/lib/format";

// Shows the selected company and lets the person switch between their companies
export default function CompanySwitcher() {
  const { me, memberships, switchCompany, canCreateCompany } = useMe();
  const [open, setOpen] = useState(false);
  if (!me) return null;
  const many = memberships.length > 1;

  return (
    <div className="relative min-w-0 sm:max-w-[240px]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full max-w-full items-center gap-1.5 rounded-lg border border-white/20 px-2.5 py-1 text-left text-sm hover:bg-white/10"
        title="Switch company"
      >
        <span className="truncate font-semibold">{me.company_name}</span>
        <span className="text-xs text-white/60">{many ? "▾" : "▸"}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-40 mt-2 w-72 overflow-hidden rounded-xl border border-white/10 bg-[#0d1528] text-white shadow-2xl">
            <p className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider text-white/50">Your companies</p>
            <div className="max-h-72 overflow-y-auto py-1">
              {memberships.map((m) => {
                const active = m.company_id === me.company_id;
                return (
                  <button
                    key={m.company_id}
                    onClick={() => {
                      setOpen(false);
                      if (!active) switchCompany(m.company_id);
                    }}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-white/5 ${active ? "bg-white/5" : ""}`}
                  >
                    <span
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-black"
                      style={{ background: active ? "linear-gradient(135deg,#2563eb,#e11d48)" : "rgba(255,255,255,0.08)" }}
                    >
                      {m.company_name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{m.company_name}</span>
                      <span className="block text-xs text-white/50">{roleLabel(m.role)}</span>
                    </span>
                    {active && <span className="text-cyan-300">✓</span>}
                  </button>
                );
              })}
            </div>
            {canCreateCompany && (
              <Link
                href="/companies"
                onClick={() => setOpen(false)}
                className="block border-t border-white/10 px-4 py-3 text-sm font-semibold text-cyan-300 hover:bg-white/5"
              >
                + Add or manage companies
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
