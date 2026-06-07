import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles").select("id").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("גישה לאדמין בלבד");
}

async function assertAdminOrStaff(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId).in("role", ["admin", "staff"]);
  if (!data || data.length === 0) throw new Error("גישה מורשית בלבד");
}

export const getAdminDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminOrStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const monthIso = monthStart.toISOString();

    // Default low-stock threshold from settings
    const { data: settingRow } = await supabaseAdmin
      .from("app_settings").select("value").eq("key", "default_low_stock_threshold").maybeSingle();
    const defaultThreshold = Number((settingRow?.value as any) ?? 5);

    const [
      { count: pendingCount },
      { count: awaitingCount },
      { count: pendingReplacementsCount },
      monthOrdersRes,
      teamsRes,
      recentOrdersRes,
      activeProductsRes,
    ] = await Promise.all([
      supabaseAdmin.from("orders").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabaseAdmin.from("orders").select("*", { count: "exact", head: true }).eq("status", "awaiting_approval"),
      supabaseAdmin.from("replacement_requests").select("*", { count: "exact", head: true }).in("status", ["preparing","ready"]),
      supabaseAdmin.from("orders").select("id, total, team_id, status, created_at").gte("created_at", monthIso),
      supabaseAdmin.from("teams").select("id, name, monthly_limit, active").eq("active", true).order("name"),
      supabaseAdmin.from("orders").select("id, status, total, created_at, ordered_by_name, teams(name)").order("created_at", { ascending: false }).limit(5),
      supabaseAdmin.from("products").select("id, name, stock, low_stock_threshold").eq("active", true),
    ]);

    const monthOrders = monthOrdersRes.data ?? [];
    const teams = teamsRes.data ?? [];

    const monthOrdersCount = monthOrders.filter((o: any) => o.status !== "cancelled").length;
    const monthRevenue = monthOrders
      .filter((o: any) => o.status !== "cancelled" && o.status !== "awaiting_approval")
      .reduce((s: number, o: any) => s + Number(o.total), 0);

    // Low-stock list using per-product or default threshold
    const lowStock = (activeProductsRes.data ?? [])
      .map((p: any) => ({ ...p, effective_threshold: p.low_stock_threshold ?? defaultThreshold }))
      .filter((p: any) => p.stock <= p.effective_threshold)
      .sort((a: any, b: any) => a.stock - b.stock)
      .slice(0, 10);
    const lowStockCount = (activeProductsRes.data ?? [])
      .filter((p: any) => p.stock <= (p.low_stock_threshold ?? defaultThreshold)).length;

    // Per-team spend
    const spendByTeam = new Map<string, number>();
    for (const o of monthOrders) {
      if (o.status === "cancelled") continue;
      spendByTeam.set(o.team_id, (spendByTeam.get(o.team_id) ?? 0) + Number(o.total));
    }
    const teamStats = teams.map((t: any) => {
      const spent = spendByTeam.get(t.id) ?? 0;
      const limit = Number(t.monthly_limit);
      const pct = limit > 0 ? Math.min(999, Math.round((spent / limit) * 100)) : 0;
      return { id: t.id, name: t.name, monthly_limit: limit, spent, pct };
    }).sort((a, b) => b.spent - a.spent);

    return {
      kpis: {
        pending: pendingCount ?? 0,
        awaiting: awaitingCount ?? 0,
        pendingReplacements: pendingReplacementsCount ?? 0,
        monthOrders: monthOrdersCount,
        monthRevenue,
        activeTeams: teams.length,
        lowStock: lowStockCount,
      },
      defaultLowStockThreshold: defaultThreshold,
      topTeams: teamStats.slice(0, 5),
      teamStats,
      recentOrders: recentOrdersRes.data ?? [],
      lowStock,
    };
  });

export const setTeamMonthlyLimit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      team_id: z.string().uuid(),
      monthly_limit: z.number().min(0).max(10_000_000),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("teams").update({ monthly_limit: data.monthly_limit }).eq("id", data.team_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
