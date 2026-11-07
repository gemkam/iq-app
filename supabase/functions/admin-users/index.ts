// Admin user management for IQ. Runs on Supabase Edge Functions with the service role key.
// Actions: status, bootstrap, guest_login, list, create, reset_password, set_active, set_role
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BAN_FOREVER = "876000h";

async function firstCompanyId(): Promise<string | null> {
  const { data } = await admin.from("companies").select("id").order("created_at").limit(1).maybeSingle();
  return data?.id ?? null;
}

// Usernames map to internal emails; short passwords get a fixed prefix (testing phase).
// The app's login page applies the same mapping (lib/auth.ts).
const DOMAIN = "iq.local";
const toEmail = (u: string) => `${u}@${DOMAIN}`;
const toPassword = (p: string) => `IQ::${p}`;
// Read-only guest account. The password is public on purpose: the guest role can only view.
const GUEST_USERNAME = "guest";
const GUEST_PASSWORD = "guest-view";

function cleanUsername(u: unknown): string | null {
  const v = String(u || "").trim().toLowerCase();
  return /^[a-z0-9._-]{3,30}$/.test(v) ? v : null;
}

function checkPassword(p: unknown): string | null {
  if (typeof p !== "string" || p.length < 4) return "Password must be at least 4 characters.";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const action = String(body.action || "");

  try {
    // ---------- No login needed ----------
    if (action === "status" || action === "bootstrap") {
      const cid = await firstCompanyId();
      if (!cid) return json({ error: "No company set up" }, 500);
      const { count } = await admin.from("company_members").select("user_id", { count: "exact", head: true }).eq("company_id", cid);
      const needsSetup = (count || 0) === 0;
      if (action === "status") return json({ needs_setup: needsSetup });

      if (!needsSetup) return json({ error: "Admin already exists. Please log in." }, 403);
      const username = cleanUsername(body.username);
      const full_name = String(body.full_name || "").trim();
      const pErr = checkPassword(body.password);
      if (!username) return json({ error: "Username: 3 to 30 letters or numbers, no spaces." }, 400);
      if (!full_name) return json({ error: "Name is required." }, 400);
      if (pErr) return json({ error: pErr }, 400);
      const email = toEmail(username);

      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password: toPassword(String(body.password)),
        email_confirm: true,
        user_metadata: { full_name },
      });
      if (error) return json({ error: error.message }, 400);
      const { error: mErr } = await admin
        .from("company_members")
        .insert({ company_id: cid, user_id: created.user.id, role: "owner", email, username, full_name });
      if (mErr) {
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: mErr.message }, 500);
      }
      return json({ ok: true });
    }

    // ---------- Guest: make sure the read-only guest account exists ----------
    if (action === "guest_login") {
      const cid = await firstCompanyId();
      if (!cid) return json({ error: "No company set up" }, 500);
      const { count: owners } = await admin
        .from("company_members").select("user_id", { count: "exact", head: true })
        .eq("company_id", cid).neq("role", "guest");
      if (!owners) return json({ error: "The app is not set up yet." }, 400);

      const { data: g } = await admin.from("company_members").select("user_id, is_active")
        .eq("company_id", cid).eq("role", "guest").maybeSingle();
      if (g && !g.is_active) return json({ error: "Guest access is turned off." }, 403);
      if (!g) {
        const { data: created, error } = await admin.auth.admin.createUser({
          email: toEmail(GUEST_USERNAME),
          password: toPassword(GUEST_PASSWORD),
          email_confirm: true,
          user_metadata: { full_name: "Guest" },
        });
        if (error) return json({ error: error.message }, 400);
        await admin.from("company_members").insert({
          company_id: cid, user_id: created.user.id, role: "guest",
          email: toEmail(GUEST_USERNAME), username: GUEST_USERNAME, full_name: "Guest (view only)",
        });
      }
      return json({ ok: true });
    }

    // ---------- Admin only ----------
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Not logged in" }, 401);
    const { data: who, error: whoErr } = await admin.auth.getUser(token);
    if (whoErr || !who.user) return json({ error: "Session expired. Please log in again." }, 401);
    const me = who.user;

    const { data: myRow } = await admin
      .from("company_members")
      .select("company_id, role, is_active")
      .eq("user_id", me.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (!myRow || !["owner", "admin"].includes(myRow.role)) return json({ error: "Only admins can manage users." }, 403);
    const cid = myRow.company_id as string;

    const getTarget = async (uid: string) => {
      const { data } = await admin.from("company_members").select("*").eq("company_id", cid).eq("user_id", uid).maybeSingle();
      return data;
    };

    if (action === "list") {
      const { data: members, error } = await admin
        .from("company_members")
        .select("user_id, role, username, full_name, is_active, created_at")
        .eq("company_id", cid)
        .order("created_at");
      if (error) return json({ error: error.message }, 500);
      const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const lastSeen = new Map((users?.users || []).map((u) => [u.id, u.last_sign_in_at]));
      return json({
        me: me.id,
        users: (members || []).map((m) => ({ ...m, last_sign_in_at: lastSeen.get(m.user_id) || null })),
      });
    }

    if (action === "create") {
      const username = cleanUsername(body.username);
      const full_name = String(body.full_name || "").trim();
      const role = body.role === "admin" ? "admin" : "staff";
      const pErr = checkPassword(body.password);
      if (!username) return json({ error: "Username: 3 to 30 letters or numbers, no spaces." }, 400);
      if (!full_name) return json({ error: "Name is required." }, 400);
      if (pErr) return json({ error: pErr }, 400);
      if (username === GUEST_USERNAME) return json({ error: "The username 'guest' is reserved." }, 400);
      const email = toEmail(username);

      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password: toPassword(String(body.password)),
        email_confirm: true,
        user_metadata: { full_name },
      });
      if (error) {
        const msg = /already|registered|exists/i.test(error.message) ? "This username is already taken." : error.message;
        return json({ error: msg }, 400);
      }
      const { error: mErr } = await admin
        .from("company_members")
        .insert({ company_id: cid, user_id: created.user.id, role, email, username, full_name });
      if (mErr) {
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: mErr.message }, 500);
      }
      return json({ ok: true });
    }

    const uid = String(body.user_id || "");
    const target = uid ? await getTarget(uid) : null;
    if (!target) return json({ error: "User not found" }, 404);

    if (action === "reset_password") {
      const pErr = checkPassword(body.password);
      if (pErr) return json({ error: pErr }, 400);
      if (target.role === "guest") return json({ error: "The guest password is fixed. Use Disable to turn guest access off." }, 400);
      if (target.role === "owner" && myRow.role !== "owner") return json({ error: "Only the owner can change the owner's password." }, 403);
      const { error } = await admin.auth.admin.updateUserById(uid, { password: toPassword(String(body.password)) });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "set_active") {
      if (uid === me.id) return json({ error: "You cannot disable your own account." }, 400);
      if (target.role === "owner") return json({ error: "The owner account cannot be disabled." }, 400);
      const active = !!body.active;
      const { error } = await admin.auth.admin.updateUserById(uid, { ban_duration: active ? "none" : BAN_FOREVER });
      if (error) return json({ error: error.message }, 400);
      await admin.from("company_members").update({ is_active: active }).eq("company_id", cid).eq("user_id", uid);
      return json({ ok: true });
    }

    if (action === "set_role") {
      if (uid === me.id) return json({ error: "You cannot change your own role." }, 400);
      if (target.role === "owner") return json({ error: "The owner's role cannot be changed." }, 400);
      if (target.role === "guest") return json({ error: "The guest account is always view only." }, 400);
      const role = body.role === "admin" ? "admin" : "staff";
      await admin.from("company_members").update({ role }).eq("company_id", cid).eq("user_id", uid);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
});
