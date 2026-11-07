"use client";
import { useEffect, useState } from "react";

// Help boxes that explain what is happening and how numbers are calculated.
// One switch (Help On/Off in the top bar) shows or hides all of them.
const KEY = "iq_help";
const EVENT = "iq-help-change";

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function useHelp(): [boolean, () => void] {
  const [on, setOn] = useState(true);
  useEffect(() => {
    setOn(read());
    const h = () => setOn(read());
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, []);
  const toggle = () => {
    try {
      localStorage.setItem(KEY, read() ? "off" : "on");
    } catch {
      /* storage blocked: toggle for this page only */
      setOn((v) => !v);
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return [on, toggle];
}

export default function Explain({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  const [on] = useHelp();
  if (!on) return null;
  return (
    <div className={`no-print rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 ${className}`}>
      <p className="mb-1 font-semibold">ⓘ {title || "How this works"}</p>
      <div className="space-y-1 leading-relaxed">{children}</div>
    </div>
  );
}

// A calculation line: label, formula, result
export function Calc({ label, formula, result }: { label: string; formula?: string; result: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-3 border-b border-sky-100 py-0.5 last:border-0">
      <span>
        <b>{label}</b>
        {formula && <span className="text-sky-700"> = {formula}</span>}
      </span>
      <span className="font-semibold">{result}</span>
    </div>
  );
}
