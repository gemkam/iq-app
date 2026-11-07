"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/quotations", label: "Quotations" },
  { href: "/invoices", label: "Invoices" },
  { href: "/settings", label: "Settings" },
];

export default function Nav() {
  const path = usePathname();
  if (path.endsWith("/print")) return null;
  return (
    <header className="no-print sticky top-0 z-20 text-white shadow" style={{ background: "var(--brand)" }}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg font-black" style={{ background: "var(--accent)" }}>
            IQ
          </span>
          <span className="hidden font-semibold sm:block">Quotations &amp; Invoices</span>
        </Link>
        <nav className="flex gap-1 overflow-x-auto text-sm">
          {links.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 ${active ? "bg-white/20 font-semibold" : "hover:bg-white/10"}`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="bg-amber-400 py-0.5 text-center text-[11px] font-semibold text-amber-950">
        DEMO MODE: use sample data only
      </div>
    </header>
  );
}
