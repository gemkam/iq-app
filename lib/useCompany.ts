"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Company } from "./types";

// Demo mode: the app works on the demo company. Later this comes from the logged-in user.
export function useCompany() {
  const [company, setCompany] = useState<Company | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase.from("companies").select("*").eq("is_demo", true).limit(1).single();
    if (error) setError(error.message);
    else setCompany(data as Company);
  };

  useEffect(() => {
    load();
  }, []);

  return { company, error, reload: load };
}
