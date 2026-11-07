"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMe } from "./AuthGate";
import { logout } from "@/lib/auth";

export default function Nav() {
  const path = usePathname();
  const { me, isAdmin } = useMe();
  if (path.endsWith("/print") || path === "/login" || path === "/setup") return null;

  const links = [
    ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
    { href: "/", label: "Dashboard" },
    { href: "/quotations", label: "Quotations" },
    { href: "/invoices", label: "Invoices" },
  ];

  return (
    <header className="no-print sticky top-0 z-20 text-white shadow" style={{ background: "var(--brand)" }}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg font-black" style={{ background: "var(--accent)" }}>
            IQ
          </span>
          <span className="hidden font-semibold lg:block">Quotations &amp; Invoices</span>
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
        <div className="flex shrink-0 items-center gap-2 text-sm">
          <span className="hidden text-white/80 sm:block">{me?.full_name || me?.username}</span>
          <button className="rounded-lg border border-white/30 px-2.5 py-1 hover:bg-white/10" onClick={logout}>
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
