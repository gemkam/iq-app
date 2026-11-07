"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// Dark is the default. Printed and shared documents always stay light (white paper).
const KEY = "iq_theme";
const EVENT = "iq-theme-change";
type Theme = "dark" | "light";

const isDocPage = (p: string) => p.endsWith("/print") || p.startsWith("/share/");

function read(): Theme {
  try {
    return localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

// Runs before the page paints, so there is no white flash
export const themeBootScript = `(function(){try{var p=location.pathname;var doc=/\\/print$/.test(p)||p.indexOf('/share/')===0;var t=localStorage.getItem('${KEY}')==='light'?'light':'dark';if(t==='dark'&&!doc)document.documentElement.classList.add('dark');}catch(e){document.documentElement.classList.add('dark');}})();`;

export function ThemeSync() {
  const path = usePathname();
  const [theme] = useTheme();
  useEffect(() => {
    const dark = theme === "dark" && !isDocPage(path);
    document.documentElement.classList.toggle("dark", dark);
  }, [theme, path]);
  return null;
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => {
    setTheme(read());
    const h = () => setTheme(read());
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, []);
  const toggle = () => {
    const next: Theme = read() === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage blocked: change for this page only */
    }
    setTheme(next);
    window.dispatchEvent(new Event(EVENT));
  };
  return [theme, toggle];
}

export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  return (
    <button
      onClick={toggle}
      className="grid h-8 w-8 place-items-center rounded-lg border border-white/30 text-base hover:bg-white/10"
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle dark mode"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
