"use client";
import Link from "next/link";
import AdminOnly from "@/components/AdminOnly";

const tiles = [
  { href: "/admin/users", title: "Users", text: "Create users, reset passwords, disable access", icon: "👥" },
  { href: "/settings", title: "Company settings", text: "Name, CR, VAT, logo and terms on documents", icon: "🏢" },
];

export default function Admin() {
  return (
    <AdminOnly>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Admin</h1>
        <div className="grid gap-4 sm:grid-cols-2">
          {tiles.map((t) => (
            <Link key={t.href} href={t.href} className="card flex items-start gap-4 p-5 hover:shadow-md">
              <span className="text-3xl">{t.icon}</span>
              <div>
                <p className="text-lg font-bold">{t.title}</p>
                <p className="text-sm text-slate-500">{t.text}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AdminOnly>
  );
}
