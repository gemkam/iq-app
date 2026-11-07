import { createClient } from "@supabase/supabase-js";

// Publishable key is safe in the browser. Env vars override these defaults.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://lgyobndktgkbqwacdese.supabase.co";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_Tc5QYVJLmYCJEvjk4qtLVQ_7YkbnMNT";

export const supabase = createClient(url, key);
