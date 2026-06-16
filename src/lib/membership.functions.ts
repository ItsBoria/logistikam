import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TeamContext = {
  team_id: string;
  team_name: string;
  pin: string;
  monthly_limit: number;
  contact_phone: string | null;
} | null;

// Returns the current user's team (or null) including the PIN that the
// existing shop functions need. Service-role read keeps it simple while RLS
// is being phased in for the shop tables.
export const getMyTeamContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TeamContext> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: m } = await supabaseAdmin
      .from("team_members")
      .select("team_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!m) return null;
    const { data: t } = await supabaseAdmin
      .from("teams")
      .select("id, name, pin, monthly_limit, contact_phone, active")
      .eq("id", m.team_id)
      .maybeSingle();
    if (!t || !t.active) return null;
    return {
      team_id: t.id,
      team_name: t.name,
      pin: t.pin,
      monthly_limit: Number(t.monthly_limit),
      contact_phone: t.contact_phone,
    };
  });

export const listActiveTeams = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin
      .rpc("has_role", { _user_id: context.userId, _role: "admin" });
    let q = supabaseAdmin
      .from("teams")
      .select("id, name, is_admin_only")
      .eq("active", true)
      .order("name");
    if (!isAdmin) q = q.eq("is_admin_only", false);
    const { data } = await q;
    return (data ?? []).map(({ id, name }) => ({ id, name }));
  });

export const setMyTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ team_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin
      .rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const { data: t } = await supabaseAdmin
      .from("teams").select("id, active, is_admin_only").eq("id", data.team_id).maybeSingle();
    if (!t || !t.active) throw new Error("צוות לא תקין");
    if (t.is_admin_only && !isAdmin) throw new Error("צוות לא תקין");
    const { error } = await supabaseAdmin
      .from("team_members")
      .upsert({ user_id: context.userId, team_id: data.team_id }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Admin "view shop as": resolves any team to the same context shape the shop uses.
export const getTeamContextById = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ team_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<TeamContext> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin
      .rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { data: t } = await supabaseAdmin
      .from("teams").select("id, name, pin, monthly_limit, contact_phone, active")
      .eq("id", data.team_id).maybeSingle();
    if (!t || !t.active) throw new Error("צוות לא תקין");
    return {
      team_id: t.id,
      team_name: t.name,
      pin: t.pin,
      monthly_limit: Number(t.monthly_limit),
      contact_phone: t.contact_phone,
    };
  });

// Claim admin role on current account using legacy admin username + password.
// Lets the existing admins migrate to Google sign-in without touching SQL.
export const claimAdminWithLegacyCreds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      identifier: z.string().min(2).max(254),
      password: z.string().min(1).max(72),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createClient } = await import("@supabase/supabase-js");
    const raw = data.identifier.trim().toLowerCase();
    const synth = raw.includes("@") ? raw : `${raw}@admins.local`;

    // Try direct email first
    const candidates = [synth];
    // Also resolve by metadata username / legacy email local-part
    const { data: list } = await supabaseAdmin.auth.admin.listUsers();
    const users = list?.users ?? [];
    const byMeta = users.find(
      (u) => ((u.user_metadata as any)?.username || "").toString().toLowerCase() === raw,
    );
    if (byMeta?.email) candidates.unshift(byMeta.email);

    // Verify password using a transient client so we don't disturb the current session.
    const url = process.env.SUPABASE_URL!;
    const anon = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const tmp = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    let legacyUserId: string | null = null;
    for (const email of candidates) {
      const { data: r, error } = await tmp.auth.signInWithPassword({ email, password: data.password });
      if (!error && r.user) { legacyUserId = r.user.id; break; }
    }
    if (!legacyUserId) throw new Error("שם משתמש או סיסמה שגויים");

    // Confirm the legacy account actually has admin role
    const { data: isAdminLegacy } = await supabaseAdmin
      .rpc("has_role", { _user_id: legacyUserId, _role: "admin" });
    if (!isAdminLegacy) throw new Error("חשבון זה אינו מנהל");

    // Grant admin to the currently signed-in user
    const { error: insErr } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: context.userId, role: "admin" }, { onConflict: "user_id,role" });
    if (insErr) throw new Error(insErr.message);
    return { ok: true };
  });
