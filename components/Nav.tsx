"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMe } from "./AuthGate";
import { logout } from "@/lib/auth";
import { useHelp } from "./Explain";

export default function Nav() {
  const path = usePathname();
  const { me, isAdmin, isGuest } = useMe();
  const [help, toggleHelp] = useHelp();
  if (path.endsWith("/print") || path === "/login" || path === "/setup" || path.startsWith("/share/")) return null;

  const links = [
    ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
    { href: "/", label: "Dashboard" },
    { href: "/quotations", label: "Quotations" },
    { href: "/invoices", label: "Invoices" },
  ];

  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href) || (href === "/admin" && path.startsWith("/settings")));

  return (
    <header className="no-print sticky top-0 z-20 text-white shadow" style={{ background: "var(--brand)" }}>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2.5">
        {/* Row 1 on phones: logo + help + logout */}
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg font-black" style={{ background: "var(--accent)" }}>
            IQ
          </span>
          <span className="hidden font-semibold lg:block">Quotations &amp; Invoices</span>
        </Link>

        {/* Links: own full-width row on phones, inline on bigger screens */}
        <nav className="order-last grid w-full grid-flow-col auto-cols-fr gap-1 text-sm md:order-none md:flex md:w-auto">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-lg px-2 py-1.5 text-center whitespace-nowrap md:px-3 ${isActive(l.href) ? "bg-white/20 font-semibold" : "hover:bg-white/10"}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2 text-sm">
          <span className="hidden text-white/80 md:block">{me?.full_name || me?.username}</span>
          <button
            className={`rounded-lg px-2.5 py-1 ${help ? "bg-sky-400 text-sky-950" : "border border-white/30"}`}
            onClick={toggleHelp}
            title="Show or hide the explanation boxes"
          >
            Help {help ? "On" : "Off"}
          </button>
          <button className="rounded-lg border border-white/30 px-2.5 py-1 hover:bg-white/10" onClick={logout}>
            Logout
          </button>
        </div>
      </div>
      {isGuest && (
        <div className="bg-amber-400 py-1 text-center text-xs font-semibold text-amber-950">
          Guest view: you can look around but cannot make changes
        </div>
      )}
    </header>
  );
}
