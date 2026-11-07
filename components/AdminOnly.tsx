"use client";
import { useMe } from "./AuthGate";

export default function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useMe();
  if (!isAdmin) return <div className="card p-6 text-center text-slate-500">Only admins can open this page.</div>;
  return <>{children}</>;
}
