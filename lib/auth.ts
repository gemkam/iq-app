import { supabase } from "./supabase";

// Testing phase: usernames map to internal emails and passwords get a fixed prefix.
// Must match supabase/functions/admin-users/index.ts
const DOMAIN = "iq.local";
export const toEmail = (u: string) => `${u.trim().toLowerCase()}@${DOMAIN}`;
export const toPassword = (p: string) => `IQ::${p}`;

export async function login(username: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: toEmail(username), password: toPassword(password) });
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
  await supabase.auth.signOut();
}

// Calls the admin-users server function
export async function adminCall<T = { ok: boolean }>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-users", { body: { action, ...body } });
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
