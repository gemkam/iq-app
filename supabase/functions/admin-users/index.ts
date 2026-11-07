// Admin user management for IQ. Runs on Supabase Edge Functions with the service role key.
// Actions: status, bootstrap, guest_login, signup, list, create, add_member, reset_password, set_active, set_role
// Roles: admin = Administrator, owner = Company owner, staff = User, guest = view only
// Admin actions work on the company passed as body.company_id (the company selected in the app).
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

// admin = Administrator, owner = Company owner, staff = User
const pickRole = (r: unknown) => (r === "admin" ? "admin" : r === "owner" ? "owner" : "staff");

function checkPassword(p: unknown): string | null {
  if (typeof p !== "string" || p.length < 4) return "Password must be at least 4 characters.";
  return null;
}

// Write a line to the activity log (shown in Admin → Activity)
async function logUsers(cid: string, byUser: string | null, targetUser: string, action: string, details: Record<string, unknown>) {
  await admin.from("audit_log").insert({
    company_id: cid,
    table_name: "users",
    record_id: targetUser,
    action,
    new_data: details,
    changed_by: byUser,
  });
}

// Ban the login only when the person has no active company left
async function syncBan(uid: string) {
  const { count } = await admin
    .from("company_members")
    .select("user_id", { count: "exact", head: true })
    .eq("user_id", uid)
    .eq("is_active", true);
  await admin.auth.admin.updateUserById(uid, { ban_duration: count ? "none" : BAN_FOREVER });
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
        .insert({ company_id: cid, user_id: created.user.id, role: "admin", email, username, full_name });
      if (mErr) {
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: mErr.message }, 500);
      }
      await logUsers(cid, created.user.id, created.user.id, "user_created", { username, full_name, role: "admin", note: "first setup" });
      return json({ ok: true });
    }

    // ---------- Guest: read-only account that can view every company ----------
    if (action === "guest_login") {
      const cid = await firstCompanyId();
      if (!cid) return json({ error: "No company set up" }, 500);
      const { count: owners } = await admin
        .from("company_members")
        .select("user_id", { count: "exact", head: true })
        .neq("role", "guest");
      if (!owners) return json({ error: "The app is not set up yet." }, 400);

      const { data: rows } = await admin.from("company_members").select("user_id, is_active").eq("role", "guest");
      let guestId = rows?.[0]?.user_id as string | undefined;
      if (rows && rows.length && !rows.some((r) => r.is_active)) return json({ error: "Guest access is turned off." }, 403);

      if (!guestId) {
        const { data: created, error } = await admin.auth.admin.createUser({
          email: toEmail(GUEST_USERNAME),
          password: toPassword(GUEST_PASSWORD),
          email_confirm: true,
          user_metadata: { full_name: "Guest" },
        });
        if (error) return json({ error: error.message }, 400);
        guestId = created.user.id;
      }
      // make sure the guest can view every company
      const { data: companies } = await admin.from("companies").select("id");
      const { data: has } = await admin.from("company_members").select("company_id").eq("user_id", guestId);
      const have = new Set((has || []).map((h) => h.company_id));
      const missing = (companies || []).filter((c) => !have.has(c.id));
      if (missing.length) {
        await admin.from("company_members").insert(
          missing.map((c) => ({
            company_id: c.id,
            user_id: guestId,
            role: "guest",
            email: toEmail(GUEST_USERNAME),
            username: GUEST_USERNAME,
            full_name: "Guest (view only)",
          }))
        );
      }
      return json({ ok: true });
    }

    // ---------- Public sign-up: a new customer creates their company with a 30-day free trial ----------
    if (action === "signup") {
      const company_name = String(body.company_name || "").trim();
      const full_name = String(body.full_name || "").trim();
      const phone = String(body.phone || "").trim() || null;
      const username = cleanUsername(body.username);
      const pErr = checkPassword(body.password);
      if (!company_name) return json({ error: "Company name is required." }, 400);
      if (!full_name) return json({ error: "Your name is required." }, 400);
      if (!username) return json({ error: "Username: 3 to 30 letters or numbers, no spaces." }, 400);
      if (username === GUEST_USERNAME) return json({ error: "The username 'guest' is reserved." }, 400);
      if (pErr) return json({ error: pErr }, 400);

      // the platform administrators (of the first company) manage every customer company
      const firstCid = await firstCompanyId();
      const { data: admins } = await admin
        .from("company_members")
        .select("user_id, username, email, full_name")
        .eq("company_id", firstCid)
        .eq("role", "admin")
        .eq("is_active", true);
      if (!admins || !admins.length) return json({ error: "Sign-up is not available yet." }, 400);

      const email = toEmail(username);
      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password: toPassword(String(body.password)),
        email_confirm: true,
        user_metadata: { full_name },
      });
      if (error) {
        const msg = /already|registered|exists/i.test(error.message) ? "This username is taken. Please choose another." : error.message;
        return json({ error: msg }, 400);
      }
      const uid = created.user.id;

      const { data: company, error: cErr } = await admin
        .from("companies")
        .insert({
          name: company_name,
          phone,
          address: "Muscat, Oman",
          plan: "trial",
          default_terms: "1. Prices are in Omani Rial (OMR).\n2. Validity as stated above.\n3. Payment as per agreed milestones.",
        })
        .select("id, trial_ends_at")
        .single();
      if (cErr || !company) {
        await admin.auth.admin.deleteUser(uid);
        return json({ error: cErr?.message || "Could not create the company." }, 500);
      }

      const rows: Record<string, unknown>[] = [
        { company_id: company.id, user_id: uid, role: "owner", email, username, full_name, is_active: true },
        ...admins.map((a) => ({ company_id: company.id, user_id: a.user_id, role: "admin", email: a.email, username: a.username, full_name: a.full_name, is_active: true })),
      ];
      const { data: g } = await admin.from("company_members").select("user_id, is_active").eq("role", "guest").limit(1).maybeSingle();
      if (g) rows.push({ company_id: company.id, user_id: g.user_id, role: "guest", email: toEmail(GUEST_USERNAME), username: GUEST_USERNAME, full_name: "Guest (view only)", is_active: g.is_active });
      const { error: mErr } = await admin.from("company_members").insert(rows);
      if (mErr) {
        await admin.from("companies").delete().eq("id", company.id);
        await admin.auth.admin.deleteUser(uid);
        return json({ error: mErr.message }, 500);
      }
      await logUsers(company.id, uid, uid, "signed_up", { username, full_name, company: company_name, trial_ends_at: company.trial_ends_at });
      return json({ ok: true, trial_ends_at: company.trial_ends_at });
    }

    // ---------- Admin only ----------
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Not logged in" }, 401);
    const { data: who, error: whoErr } = await admin.auth.getUser(token);
    if (whoErr || !who.user) return json({ error: "Session expired. Please log in again." }, 401);
    const me = who.user;

    let q = admin.from("company_members").select("company_id, role, is_active").eq("user_id", me.id).eq("is_active", true);
    if (body.company_id) q = q.eq("company_id", String(body.company_id));
    const { data: myRow } = await q.order("created_at").limit(1).maybeSingle();
    if (!myRow || myRow.role !== "admin") return json({ error: "Only administrators can manage users." }, 403);
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
      const role = pickRole(body.role);
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
        const msg = /already|registered|exists/i.test(error.message)
          ? "This username already exists. Use 'Add existing user' to give them access to this company."
          : error.message;
        return json({ error: msg }, 400);
      }
      const { error: mErr } = await admin
        .from("company_members")
        .insert({ company_id: cid, user_id: created.user.id, role, email, username, full_name });
      if (mErr) {
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: mErr.message }, 500);
      }
      await logUsers(cid, me.id, created.user.id, "user_created", { username, full_name, role });
      return json({ ok: true });
    }

    // Give an existing person access to this company too
    if (action === "add_member") {
      const username = cleanUsername(body.username);
      const role = pickRole(body.role);
      if (!username || username === GUEST_USERNAME) return json({ error: "Enter a valid username." }, 400);
      const { data: existing } = await admin
        .from("company_members")
        .select("user_id, email, full_name, username")
        .eq("username", username)
        .limit(1)
        .maybeSingle();
      if (!existing) return json({ error: `No user called '${username}'. Create them instead.` }, 404);
      const already = await getTarget(existing.user_id);
      if (already) return json({ error: `${username} already has access to this company.` }, 400);
      const { error } = await admin.from("company_members").insert({
        company_id: cid,
        user_id: existing.user_id,
        role,
        email: existing.email,
        username: existing.username,
        full_name: existing.full_name,
      });
      if (error) return json({ error: error.message }, 500);
      await syncBan(existing.user_id);
      await logUsers(cid, me.id, existing.user_id, "user_added", { username: existing.username, full_name: existing.full_name, role });
      return json({ ok: true });
    }

    const uid = String(body.user_id || "");
    const target = uid ? await getTarget(uid) : null;
    if (!target) return json({ error: "User not found" }, 404);

    if (action === "reset_password") {
      const pErr = checkPassword(body.password);
      if (pErr) return json({ error: pErr }, 400);
      if (target.role === "guest") return json({ error: "The guest password is fixed. Use Disable to turn guest access off." }, 400);
      const { error } = await admin.auth.admin.updateUserById(uid, { password: toPassword(String(body.password)) });
      if (error) return json({ error: error.message }, 400);
      await logUsers(cid, me.id, uid, "password_changed", { username: target.username, full_name: target.full_name });
      return json({ ok: true });
    }

    if (action === "set_active") {
      if (uid === me.id) return json({ error: "You cannot disable your own account." }, 400);
      const active = !!body.active;
      if (target.role === "guest") {
        // guest is switched on or off for all companies at once
        await admin.from("company_members").update({ is_active: active }).eq("user_id", uid);
      } else {
        await admin.from("company_members").update({ is_active: active }).eq("company_id", cid).eq("user_id", uid);
      }
      await syncBan(uid);
      await logUsers(cid, me.id, uid, active ? "user_enabled" : "user_disabled", { username: target.username, full_name: target.full_name });
      return json({ ok: true });
    }

    if (action === "set_role") {
      if (uid === me.id) return json({ error: "You cannot change your own role." }, 400);
      if (target.role === "guest") return json({ error: "The guest account is always view only." }, 400);
      const role = pickRole(body.role);
      await admin.from("company_members").update({ role }).eq("company_id", cid).eq("user_id", uid);
      await logUsers(cid, me.id, uid, "role_changed", { username: target.username, full_name: target.full_name, from: target.role, to: role });
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
});
