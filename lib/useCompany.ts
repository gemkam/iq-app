"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useMe } from "@/components/AuthGate";
import type { Company } from "./types";

// The company of the logged-in user
export function useCompany() {
  const { me } = useMe();
  const [company, setCompany] = useState<Company | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!me) return;
    const { data, error } = await supabase.from("companies").select("*").eq("id", me.company_id).single();
    if (error) setError(error.message);
    else setCompany(data as Company);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.company_id]);

  return { company, error, reload: load };
}
