import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

async function isApprover(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("is_approver", { _user_id: ctx.userId });
  return !!data;
}

export type MissionRow = {
  id: string;
  week_id: string;
  day_of_week: number;
  position: number;
  title: string;
  details: string | null;
  done: boolean;
};

export type WeekRow = {
  id: string;
  year: number;
  week: number;
  owner_user_id: string;
  notes: string | null;
  created_by: string | null;
  created_by_name: string | null;
  author_signed_at: string | null;
  author_signature_name: string | null;
  approver_user_id: string | null;
  approver_signed_at: string | null;
  approver_signature_name: string | null;
  locked: boolean;
};

export type AdminOption = { id: string; name: string; is_approver: boolean };

export const listCalendarAdmins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("user_id").eq("role", "admin");
    const ids = (roles ?? []).map((r: any) => r.user_id);
    if (!ids.length) return [] as AdminOption[];
    const { data: profs } = await supabaseAdmin
      .from("profiles").select("id, display_name, email, is_approver").in("id", ids);
    return (profs ?? []).map((p: any) => ({
      id: p.id,
      name: p.display_name || p.email || p.id.slice(0, 8),
      is_approver: !!p.is_approver,
    })) as AdminOption[];
  });

export const setAdminApprover = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; is_approver: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles").update({ is_approver: data.is_approver }).eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMissionWeek = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { year: number; week: number; owner_user_id?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase, userId } = context;
    const owner = data.owner_user_id ?? userId;
    const isOwner = owner === userId;
    const approver = await isApprover(context);

    let { data: weekRow, error: selErr } = await supabase
      .from("mission_weeks")
      .select("*")
      .eq("year", data.year)
      .eq("week", data.week)
      .eq("owner_user_id", owner)
      .maybeSingle();
    if (selErr) throw new Error(selErr.message);

    if (!weekRow) {
      if (!isOwner) {
        // viewing another admin's week that doesn't exist yet
        return {
          week: null as any,
          missions: [] as MissionRow[],
          can_edit: false,
          can_sign_author: false,
          can_sign_approver: approver,
          is_owner: false,
        };
      }
      const { data: prof } = await supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle();
      const ins = await supabase
        .from("mission_weeks")
        .insert({
          year: data.year, week: data.week, owner_user_id: userId,
          created_by: userId, created_by_name: prof?.display_name ?? null,
        })
        .select("*")
        .single();
      if (ins.error) throw new Error(ins.error.message);
      weekRow = ins.data;
    }

    const { data: missions, error: mErr } = await supabase
      .from("missions")
      .select("*")
      .eq("week_id", weekRow.id)
      .order("day_of_week", { ascending: true })
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (mErr) throw new Error(mErr.message);

    return {
      week: weekRow as WeekRow,
      missions: (missions ?? []) as MissionRow[],
      can_edit: isOwner && !weekRow.locked,
      can_sign_author: isOwner && !weekRow.author_signed_at,
      can_sign_approver: approver && !weekRow.approver_signed_at,
      is_owner: isOwner,
    };
  });

async function assertOwner(ctx: { supabase: any; userId: string }, week_id: string) {
  const { data: w } = await ctx.supabase.from("mission_weeks").select("owner_user_id, locked").eq("id", week_id).maybeSingle();
  if (!w) throw new Error("שבוע לא נמצא");
  if (w.owner_user_id !== ctx.userId) throw new Error("רק בעל הלוח יכול לערוך");
  if (w.locked) throw new Error("השבוע נעול — לא ניתן לערוך");
  return w;
}

export const upsertMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; week_id: string; day_of_week: number; title: string; details?: string | null }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    await assertOwner(context, data.week_id);

    if (data.id) {
      const { error } = await supabase
        .from("missions")
        .update({ title: data.title, details: data.details ?? null, day_of_week: data.day_of_week })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { data: existing } = await supabase
      .from("missions")
      .select("position")
      .eq("week_id", data.week_id)
      .eq("day_of_week", data.day_of_week)
      .order("position", { ascending: false })
      .limit(1);
    const nextPos = existing && existing[0] ? (existing[0].position ?? 0) + 1 : 0;
    const { error } = await supabase.from("missions").insert({
      week_id: data.week_id,
      day_of_week: data.day_of_week,
      position: nextPos,
      title: data.title,
      details: data.details ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const { data: row } = await supabase.from("missions").select("week_id").eq("id", data.id).maybeSingle();
    if (!row) return { ok: true };
    await assertOwner(context, row.week_id);
    const { error } = await supabase.from("missions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleMissionDone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; done: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const { data: row } = await supabase.from("missions").select("week_id").eq("id", data.id).maybeSingle();
    if (!row) return { ok: true };
    await assertOwner(context, row.week_id);
    const { error } = await context.supabase.from("missions").update({ done: data.done }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateWeekNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { week_id: string; notes: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await assertOwner(context, data.week_id);
    const { error } = await context.supabase.from("mission_weeks").update({ notes: data.notes }).eq("id", data.week_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const signMissionWeek = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { week_id: string; role: "author" | "approver"; signature_name: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase, userId } = context;
    const name = data.signature_name.trim();
    if (!name) throw new Error("נדרש שם");

    const { data: w } = await supabase.from("mission_weeks").select("owner_user_id, author_signed_at, approver_signed_at").eq("id", data.week_id).maybeSingle();
    if (!w) throw new Error("שבוע לא נמצא");

    const patch: any = {};
    if (data.role === "author") {
      if (w.owner_user_id !== userId) throw new Error("רק בעל הלוח חותם כרכז");
      patch.author_signed_at = new Date().toISOString();
      patch.author_signature_name = name;
    } else {
      if (!(await isApprover(context))) throw new Error("רק מנהל מאשר יכול לחתום");
      patch.approver_signed_at = new Date().toISOString();
      patch.approver_signature_name = name;
      patch.approver_user_id = userId;
    }

    const { data: updated, error } = await supabase
      .from("mission_weeks")
      .update(patch)
      .eq("id", data.week_id)
      .select("author_signed_at, approver_signed_at")
      .single();
    if (error) throw new Error(error.message);

    if (updated.author_signed_at && updated.approver_signed_at) {
      await supabase.from("mission_weeks").update({ locked: true }).eq("id", data.week_id);
    }
    return { ok: true };
  });

export const reopenMissionWeek = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { week_id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase, userId } = context;
    const { data: w } = await supabase.from("mission_weeks").select("owner_user_id").eq("id", data.week_id).maybeSingle();
    if (!w) throw new Error("שבוע לא נמצא");
    const approver = await isApprover(context);
    if (w.owner_user_id !== userId && !approver) throw new Error("רק הבעלים או מאשר יכול לפתוח מחדש");
    const { error } = await supabase
      .from("mission_weeks")
      .update({
        locked: false,
        author_signed_at: null, author_signature_name: null,
        approver_signed_at: null, approver_signature_name: null, approver_user_id: null,
      })
      .eq("id", data.week_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
