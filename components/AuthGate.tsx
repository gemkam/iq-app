"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getActiveCompanyId, setActiveCompanyId } from "@/lib/activeCompany";

export type Me = {
  user_id: string;
  company_id: string;
  company_name: string;
  role: "owner" | "admin" | "staff" | "guest";
  full_name: string | null;
  username: string | null;
};

type Ctx = {
  me: Me | null;
  memberships: Me[];
  isAdmin: boolean;
  isGuest: boolean;
  canCreateCompany: boolean;
  switchCompany: (companyId: string) => void;
  refresh: () => void;
};
const AuthCtx = createContext<Ctx>({
  me: null,
  memberships: [],
  isAdmin: false,
  isGuest: false,
  canCreateCompany: false,
  switchCompany: () => {},
  refresh: () => {},
});
export const useMe = () => useContext(AuthCtx);

const PUBLIC = ["/login", "/setup"];

type Row = {
  user_id: string;
  company_id: string;
  role: Me["role"];
  full_name: string | null;
  username: string | null;
  companies: { name: string; created_at: string } | null;
};

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [memberships, setMemberships] = useState<Me[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const isShare = path.startsWith("/share/");
  const isPublic = PUBLIC.includes(path) || isShare;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadMe = async (uid: string) => {
    const { data } = await supabase
      .from("company_members")
      .select("user_id, company_id, role, full_name, username, companies(name, created_at)")
      .eq("user_id", uid)
      .eq("is_active", true);
    const rows = ((data as unknown as Row[]) || [])
      .map((r) => ({
        user_id: r.user_id,
        company_id: r.company_id,
        role: r.role,
        full_name: r.full_name,
        username: r.username,
        company_name: r.companies?.name || "Company",
        _created: r.companies?.created_at || "",
      }))
      .sort((a, b) => a._created.localeCompare(b._created))
      .map(({ _created, ...m }) => {
        void _created;
        return m as Me;
      });

    if (rows.length === 0) {
      setProblem("Your account has no access to this app. Contact your admin.");
      setMe(null);
      setMemberships([]);
      return;
    }
    const saved = getActiveCompanyId();
    const active = rows.find((r) => r.company_id === saved) || rows[0];
    setActiveCompanyId(active.company_id);
    setProblem(null);
    setMemberships(rows);
    setMe(active);
  };

  useEffect(() => {
    if (session === undefined) return;
    if (!session) {
      setMe(null);
      setMemberships([]);
      if (!isPublic) router.replace("/login");
      return;
    }
    loadMe(session.user.id);
    if (isPublic && !isShare) router.replace("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, isPublic, isShare]);

  const switchCompany = (companyId: string) => {
    const m = memberships.find((x) => x.company_id === companyId);
    if (!m) return;
    setActiveCompanyId(companyId);
    setMe(m);
    router.push("/");
  };

  if (isPublic) return <>{children}</>;
  if (session === undefined || (session && !me && !problem)) return <p className="p-6 text-slate-500">Loading...</p>;
  if (!session) return null;
  if (problem)
    return (
      <div className="mx-auto mt-20 max-w-sm space-y-4 text-center">
        <p className="text-red-600">{problem}</p>
        <button className="btn-light" onClick={() => supabase.auth.signOut()}>Log out</button>
      </div>
    );

  const isAdmin = me?.role === "owner" || me?.role === "admin";
  return (
    <AuthCtx.Provider
      value={{
        me,
        memberships,
        isAdmin,
        isGuest: me?.role === "guest",
        canCreateCompany: memberships.some((m) => m.role === "owner" || m.role === "admin"),
        switchCompany,
        refresh: () => session && loadMe(session.user.id),
      }}
    >
      {/* key: every page reloads its data when the company changes */}
      <div key={me?.company_id}>{children}</div>
    </AuthCtx.Provider>
  );
}
