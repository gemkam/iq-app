import { supabase } from "./supabase";
import { getActiveCompanyId } from "./activeCompany";

// Testing phase: usernames map to internal emails and passwords get a fixed prefix.
// Must match supabase/functions/admin-users/index.ts
const DOMAIN = "iq.local";
export const toEmail = (u: string) => `${u.trim().toLowerCase()}@${DOMAIN}`;
export const toPassword = (p: string) => `IQ::${p}`;

// Records login/logout in the activity log (Admin → Activity). Never blocks the user.
async function logSession(action: "login" | "logout") {
  try {
    let cid = getActiveCompanyId();
    if (!cid) {
      const { data } = await supabase.from("company_members").select("company_id").eq("is_active", true).limit(1).maybeSingle();
      cid = data?.company_id ?? null;
    }
    if (cid) await supabase.rpc("log_activity", { p_company: cid, p_action: action, p_details: { device: navigator.userAgent.slice(0, 120) } });
  } catch {
    /* logging must never break login */
  }
}

export async function login(username: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: toEmail(username), password: toPassword(password) });
  if (!error) logSession("login");
  if (error) {
    if (/invalid/i.test(error.message)) throw new Error("Wrong username or password.");
    if (/banned/i.test(error.message)) throw new Error("This account is disabled. Contact your admin.");
    throw new Error(error.message);
  }
}

// Read-only guest access (must match the server function)
export async function guestLogin() {
  await adminCall("guest_login");
  await login("guest", "guest-view");
}

export async function logout() {
  try {
    sessionStorage.removeItem("iq_admin_unlocked");
  } catch {
    /* ignore */
  }
  await logSession("logout");
  await supabase.auth.signOut();
}

// Calls the admin-users server function
export async function adminCall<T = { ok: boolean }>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  // admin actions apply to the company selected in the app
  const company_id = body.company_id ?? getActiveCompanyId() ?? undefined;
  const { data, error } = await supabase.functions.invoke("admin-users", { body: { action, company_id, ...body } });
  if (error) {
    // Read the message the function sent back
    let msg = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) msg = (await ctx.json()).error || msg;
    } catch {
      /* keep default */
    }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
