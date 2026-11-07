"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type Me = {
  user_id: string;
  company_id: string;
  role: "owner" | "admin" | "staff";
  full_name: string | null;
  username: string | null;
};

type Ctx = { me: Me | null; isAdmin: boolean; refresh: () => void };
const AuthCtx = createContext<Ctx>({ me: null, isAdmin: false, refresh: () => {} });
export const useMe = () => useContext(AuthCtx);

const PUBLIC = ["/login", "/setup"];

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [me, setMe] = useState<Me | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const isPublic = PUBLIC.includes(path) || path.startsWith("/share/");
  const isShare = path.startsWith("/share/");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadMe = async (uid: string) => {
    const { data } = await supabase
      .from("company_members")
      .select("user_id, company_id, role, full_name, username")
      .eq("user_id", uid)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (!data) {
      setProblem("Your account has no access to this app. Contact your admin.");
      setMe(null);
    } else {
      setProblem(null);
      setMe(data as Me);
    }
  };

  useEffect(() => {
    if (session === undefined) return;
    if (!session) {
      setMe(null);
      if (!isPublic) router.replace("/login");
      return;
    }
    loadMe(session.user.id);
    if (isPublic && !isShare) router.replace("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, isPublic, isShare]);

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

  return (
    <AuthCtx.Provider value={{ me, isAdmin: me?.role === "owner" || me?.role === "admin", refresh: () => session && loadMe(session.user.id) }}>
      {children}
    </AuthCtx.Provider>
  );
}
