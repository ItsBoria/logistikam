import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const BOOTSTRAP_EMAIL = "davidpanasik@hotmail.com";
const BUCKET = "product-images";
const SIGN_TTL = 60 * 60 * 24 * 7;

async function resolveImage(supabaseAdmin: any, url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("storage:")) {
    const path = url.slice("storage:".length);
    const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, SIGN_TTL);
    return data?.signedUrl ?? null;
  }
  return url;
}

// ---- Bootstrap (callable without auth) ----
export const bootstrapAdminStatus = createServerFn({ method: "GET" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("user_roles").select("*", { count: "exact", head: true }).eq("role", "admin");
    return { needsBootstrap: (count ?? 0) === 0, email: BOOTSTRAP_EMAIL };
  });

export const bootstrapAdmin = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({
    email: z.string().email(),
    password: z.string().min(8).max(72),
  }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.email.toLowerCase() !== BOOTSTRAP_EMAIL) {
      throw new Error("רק כתובת האימייל המורשית יכולה לאתחל מנהל");
    }
    const { count } = await supabaseAdmin
      .from("user_roles").select("*", { count: "exact", head: true }).eq("role", "admin");
    if ((count ?? 0) > 0) throw new Error("מנהל ראשי כבר קיים");

    // Try to find an existing user with this email
    const { data: list } = await supabaseAdmin.auth.admin.listUsers();
    const existing = list.users.find(u => u.email?.toLowerCase() === data.email.toLowerCase());
    let userId: string;
    if (existing) {
      userId = existing.id;
      await supabaseAdmin.auth.admin.updateUserById(userId, { password: data.password, email_confirm: true });
    } else {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: data.email, password: data.password, email_confirm: true,
      });
      if (error || !created.user) throw new Error(error?.message || "שגיאה ביצירת משתמש");
      userId = created.user.id;
    }
    const { error: roleErr } = await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "admin" });
    if (roleErr) throw new Error(roleErr.message);
    return { ok: true };
  });

// ---- Authenticated admin helpers ----
async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles")
    .select("id").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("גישה לאדמין בלבד");
}

async function assertAdminOrStaff(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles")
    .select("role").eq("user_id", userId).in("role", ["admin", "staff"]);
  if (!data || data.length === 0) throw new Error("גישה מורשית בלבד");
}

// Low-stock check + admin push notification. Best-effort.
async function maybeNotifyLowStock(supabaseAdmin: any, productId: string, prevStock: number) {
  try {
    const { data: prod } = await supabaseAdmin
      .from("products").select("id, name, stock, low_stock_threshold, active").eq("id", productId).maybeSingle();
    if (!prod || !prod.active) return;
    const { data: settingRow } = await supabaseAdmin
      .from("app_settings").select("value").eq("key", "default_low_stock_threshold").maybeSingle();
    const defaultThreshold = Number((settingRow?.value as any) ?? 5);
    const threshold = prod.low_stock_threshold ?? defaultThreshold;
    if (prevStock > threshold && prod.stock <= threshold) {
      const { sendPushToAdmins } = await import("./admin-push.server");
      await sendPushToAdmins("low_stock", {
        title: prod.stock === 0 ? "מוצר אזל מהמלאי" : "התראת מלאי נמוך",
        body: `${prod.name} — נשאר ${prod.stock} (סף ${threshold})`,
        url: "/admin/notifications",
      });
    }
  } catch (e: any) {
    console.warn("[low stock notify] failed:", e?.message);
  }
}

// Admin user management
export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role, created_at")
      .in("role", ["admin", "staff"]);
    const { data: list } = await supabaseAdmin.auth.admin.listUsers();
    // Group roles per user
    const byUser = new Map<string, { roles: string[]; created_at: string }>();
    for (const r of roles ?? []) {
      const row = r as any;
      const cur = byUser.get(row.user_id) ?? { roles: [] as string[], created_at: row.created_at as string };
      cur.roles.push(row.role as string);
      if (new Date(row.created_at) < new Date(cur.created_at)) cur.created_at = row.created_at;
      byUser.set(row.user_id, cur);
    }
    return Array.from(byUser.entries()).map(([userId, info]) => {
      const u = list.users.find(x => x.id === userId);
      return {
        user_id: userId,
        email: u?.email ?? "(לא ידוע)",
        username: (u?.user_metadata as any)?.username ?? null,
        roles: info.roles as ("admin" | "staff")[],
        is_admin: info.roles.includes("admin"),
        is_staff: info.roles.includes("staff"),
        created_at: info.created_at,
      };
    });
  });

export const createAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    email: z.string().email(),
    username: z.string().min(2).max(40).regex(/^[a-zA-Z0-9_.-]+$/, "שם משתמש לא תקין"),
    password: z.string().min(8).max(72),
    role: z.enum(["admin", "staff"]).default("admin"),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const usernameLower = data.username.trim().toLowerCase();
    const { data: list } = await supabaseAdmin.auth.admin.listUsers();

    // Ensure username is unique across users
    const usernameTaken = list.users.find(
      (u) => ((u.user_metadata as any)?.username || "").toString().toLowerCase() === usernameLower
        && u.email?.toLowerCase() !== data.email.toLowerCase(),
    );
    if (usernameTaken) throw new Error("שם המשתמש כבר תפוס");

    let userId = list.users.find(u => u.email?.toLowerCase() === data.email.toLowerCase())?.id;
    if (!userId) {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { username: usernameLower },
      });
      if (error || !created.user) throw new Error(error?.message || "שגיאה ביצירת משתמש");
      userId = created.user.id;
    } else {
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: data.password,
        user_metadata: { username: usernameLower },
      });
    }
    await supabaseAdmin.from("user_roles").upsert({ user_id: userId, role: data.role }, { onConflict: "user_id,role" });

    // Default notification prefs ON for new admin users
    if (data.role === "admin") {
      const events = ["order_created", "order_awaiting_approval", "low_stock", "replacement_request"];
      await supabaseAdmin.from("admin_notification_prefs").upsert(
        events.map((e) => ({ user_id: userId!, event_type: e, enabled: true })),
        { onConflict: "user_id,event_type" },
      );
    }
    return { ok: true };
  });

export const updateAdminUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    user_id: z.string().uuid(),
    role: z.enum(["admin", "staff", "customer"]),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.user_id === context.userId && data.role !== "admin") {
      throw new Error("לא ניתן לשנות את התפקיד של עצמך");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Remove other admin/staff roles
    await supabaseAdmin.from("user_roles").delete()
      .eq("user_id", data.user_id).in("role", ["admin", "staff"]);
    if (data.role === "customer") return { ok: true };
    const { error } = await supabaseAdmin.from("user_roles")
      .insert({ user_id: data.user_id, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const searchRegisteredUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ query: z.string().max(200).optional().default("") }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("user_id, role").in("role", ["admin", "staff"]);
    const roleByUser = new Map<string, "admin" | "staff">();
    for (const r of (roles ?? []) as any[]) {
      const cur = roleByUser.get(r.user_id);
      if (r.role === "admin" || !cur) roleByUser.set(r.user_id, r.role);
    }
    const ids = list.users.map(u => u.id);
    const safeIds = ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];
    const { data: profs } = await supabaseAdmin
      .from("profiles").select("id, display_name").in("id", safeIds);
    const nameById = new Map((profs ?? []).map((p: any) => [p.id, p.display_name as string | null]));
    const { data: members } = await supabaseAdmin
      .from("team_members").select("user_id, team_id").in("user_id", safeIds);
    const teamIdByUser = new Map<string, string>((members ?? []).map((m: any) => [m.user_id, m.team_id]));
    const teamIds = Array.from(new Set(Array.from(teamIdByUser.values())));
    const { data: teams } = teamIds.length
      ? await supabaseAdmin.from("teams").select("id, name").in("id", teamIds)
      : { data: [] as any[] };
    const teamNameById = new Map((teams ?? []).map((t: any) => [t.id, t.name as string]));
    const q = data.query.trim().toLowerCase();
    const rows = list.users.map(u => {
      const md = (u.user_metadata as any) || {};
      const displayName = nameById.get(u.id) || md.full_name || md.name || (u.email?.split("@")[0] ?? "");
      const provider = u.app_metadata?.provider || "email";
      const teamId = teamIdByUser.get(u.id) ?? null;
      return {
        id: u.id,
        email: u.email ?? "",
        displayName: displayName as string,
        provider: provider as string,
        currentRole: (roleByUser.get(u.id) ?? "customer") as "admin" | "staff" | "customer",
        team_id: teamId,
        team_name: teamId ? (teamNameById.get(teamId) ?? null) : null,
        created_at: u.created_at,
      };
    });
    const filtered = q
      ? rows.filter(r => r.email.toLowerCase().includes(q) || r.displayName.toLowerCase().includes(q))
      : rows;
    filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return filtered.slice(0, 50);
  });


export const deleteAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ user_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.user_id === context.userId) throw new Error("לא ניתן למחוק את עצמך");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id).in("role", ["admin", "staff"]);
    await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    return { ok: true };
  });

// Teams (admin-only — exposes PIN)
export const listTeams = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: teams } = await supabaseAdmin.from("teams").select("*").order("created_at", { ascending: false });
    const withSpent = await Promise.all((teams ?? []).map(async (t) => {
      const { data: spent } = await supabaseAdmin.rpc("team_month_spent", { _team_id: t.id });
      return { ...t, monthly_spent: Number(spent ?? 0) };
    }));
    return withSpent;
  });

// Lightweight team list (id+name only) for use in filter dropdowns by staff users.
export const listTeamsBasic = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminOrStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("teams").select("id, name, active").order("name");
    return data ?? [];
  });

export const upsertTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1).max(100),
    pin: z.string().min(4).max(20),
    monthly_limit: z.number().min(0).max(10_000_000),
    contact_phone: z.string().max(20).optional().nullable(),
    active: z.boolean(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.id) {
      const { error } = await supabaseAdmin.from("teams").update({
        name: data.name, pin: data.pin, monthly_limit: data.monthly_limit,
        contact_phone: data.contact_phone, active: data.active,
      }).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("teams").insert({
        name: data.name, pin: data.pin, monthly_limit: data.monthly_limit,
        contact_phone: data.contact_phone, active: data.active,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("teams").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Products
export const listProductsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminOrStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("products").select("*").order("name");
    const resolved = await Promise.all((data ?? []).map(async (p) => ({
      ...p,
      image_url: await resolveImage(supabaseAdmin, p.image_url),
      _raw_image_url: p.image_url, // for editing
    })));
    return resolved;
  });

// Staff-friendly stock-only update. Allows admin OR staff. Fires low-stock notification on cross.
export const updateProductStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    id: z.string().uuid(),
    stock: z.number().int().min(0).max(10_000_000),
    low_stock_threshold: z.number().int().min(0).max(10_000_000).nullable().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdminOrStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prev } = await supabaseAdmin
      .from("products").select("stock").eq("id", data.id).maybeSingle();
    if (!prev) throw new Error("מוצר לא נמצא");
    const update: { stock: number; low_stock_threshold?: number | null } = { stock: data.stock };
    if (data.low_stock_threshold !== undefined) update.low_stock_threshold = data.low_stock_threshold;
    const { error } = await supabaseAdmin.from("products").update(update).eq("id", data.id);
    if (error) throw new Error(error.message);
    await maybeNotifyLowStock(supabaseAdmin, data.id, Number(prev.stock));
    return { ok: true };
  });

// image_url accepts: empty, http(s)://..., or "storage:<path>"
const imageUrlSchema = z.string().max(2000).optional().nullable().refine(
  (v) => !v || v.startsWith("http://") || v.startsWith("https://") || v.startsWith("storage:"),
  "כתובת תמונה לא תקינה"
);

const productSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  price: z.number().min(0).max(10_000_000),
  stock: z.number().int().min(0).max(10_000_000),
  category: z.string().max(100).optional().nullable(),
  image_url: imageUrlSchema,
  active: z.boolean(),
  low_stock_threshold: z.number().int().min(0).max(10_000_000).nullable().optional(),
});

// ---- App settings ----
export const getAppSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminOrStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("app_settings").select("key, value");
    const map: Record<string, any> = {};
    for (const r of data ?? []) map[r.key] = r.value;
    return {
      default_low_stock_threshold: Number(map.default_low_stock_threshold ?? 5),
    };
  });

export const setDefaultLowStockThreshold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ value: z.number().int().min(0).max(10_000_000) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert({ key: "default_low_stock_threshold", value: data.value, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const upsertProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => productSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = { ...data, image_url: data.image_url || null };
    if (data.id) {
      const { error } = await supabaseAdmin.from("products").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("products").insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const uploadProductImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    filename: z.string().min(1).max(200),
    content_type: z.string().min(1).max(100),
    data_base64: z.string().min(1).max(15_000_000),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ext = (data.filename.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${crypto.randomUUID()}.${ext}`;
    const bytes = Buffer.from(data.data_base64, "base64");
    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, {
      contentType: data.content_type, upsert: false,
    });
    if (error) throw new Error(error.message);
    const { data: signed } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, SIGN_TTL);
    return { storage_ref: `storage:${path}`, preview_url: signed?.signedUrl ?? null };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("products").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bulkImportProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    rows: z.array(z.object({
      name: z.string().min(1),
      description: z.string().optional().nullable(),
      price: z.number().min(0),
      stock: z.number().int().min(0),
      category: z.string().optional().nullable(),
      image_url: z.string().optional().nullable(),
    })).min(1).max(2000),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = data.rows.map(r => ({
      name: r.name, description: r.description ?? null,
      price: r.price, stock: r.stock,
      category: r.category ?? null,
      image_url: r.image_url || null,
      active: true,
    }));
    const { error } = await supabaseAdmin.from("products").insert(payload);
    if (error) throw new Error(error.message);
    return { inserted: payload.length };
  });

// Orders
export const listOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    team_id: z.string().uuid().nullable().optional(),
    status: z.string().nullable().optional(),
    from: z.string().nullable().optional(),
    to: z.string().nullable().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdminOrStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("orders").select("*, teams(name), order_items(*)").order("created_at", { ascending: false });
    if (data.team_id) q = q.eq("team_id", data.team_id);
    if (data.status) q = q.eq("status", data.status as any);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    const { data: orders, error } = await q;
    if (error) throw new Error(error.message);
    return orders ?? [];
  });

export const updateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    id: z.string().uuid(),
    status: z.enum(["pending","approved","preparing","ready","completed","cancelled","awaiting_approval"]),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdminOrStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prev } = await supabaseAdmin.from("orders").select("*, order_items(*), teams(name)").eq("id", data.id).single();
    if (!prev) throw new Error("הזמנה לא נמצאה");

    // If approving an awaiting_approval order, deduct stock now
    if (prev.status === "awaiting_approval" && data.status !== "awaiting_approval" && data.status !== "cancelled") {
      for (const it of prev.order_items as any[]) {
        if (!it.product_id) continue;
        const { data: prod } = await supabaseAdmin.from("products").select("stock").eq("id", it.product_id).maybeSingle();
        if (prod) {
          await supabaseAdmin.from("products").update({ stock: Math.max(0, prod.stock - it.quantity) }).eq("id", it.product_id);
          await maybeNotifyLowStock(supabaseAdmin, it.product_id, Number(prod.stock));
        }
      }
    }
    // If cancelling a previously stock-deducted order, restore stock
    if (data.status === "cancelled" && prev.status !== "awaiting_approval" && prev.status !== "cancelled") {
      for (const it of prev.order_items as any[]) {
        if (!it.product_id) continue;
        const { data: prod } = await supabaseAdmin.from("products").select("stock").eq("id", it.product_id).maybeSingle();
        if (prod) await supabaseAdmin.from("products").update({ stock: prod.stock + it.quantity }).eq("id", it.product_id);
      }
    }

    const { error } = await supabaseAdmin.from("orders").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);

    // Notify when status becomes "ready"
    if (data.status === "ready") {
      const teamName = (prev as any).teams?.name ?? "";
      const text = `ההזמנה של ${teamName} מוכנה לאיסוף. סה"כ: ₪${prev.total}`;
      if (prev.contact_phone) {
        const { sendSms } = await import("./sms.server");
        await sendSms(prev.contact_phone, text).catch((e) => console.warn("[sms] failed:", e?.message));
      }
      const { sendPushToTeam } = await import("./push.server");
      await sendPushToTeam(prev.team_id, {
        title: "ההזמנה מוכנה לאיסוף 🎉",
        body: text,
        url: "/shop/orders",
      }).catch((e) => console.warn("[push] failed:", e?.message));
    }
    return { ok: true };
  });

const orderItemEditSchema = z.object({
  id: z.string().uuid().optional(),
  product_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(200),
  price: z.number().min(0).max(10_000_000),
  quantity: z.number().int().min(1).max(999),
});

export const updateOrderItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    order_id: z.string().uuid(),
    items: z.array(orderItemEditSchema).min(1).max(200),
    notes: z.string().max(500).optional().nullable(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdminOrStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: prev } = await supabaseAdmin
      .from("orders").select("*, order_items(*)").eq("id", data.order_id).single();
    if (!prev) throw new Error("הזמנה לא נמצאה");

    const wasStockDeducted = prev.status !== "awaiting_approval" && prev.status !== "cancelled";

    // Restore stock for previous items if needed
    if (wasStockDeducted) {
      for (const it of prev.order_items as any[]) {
        if (!it.product_id) continue;
        const { data: prod } = await supabaseAdmin.from("products").select("stock").eq("id", it.product_id).maybeSingle();
        if (prod) await supabaseAdmin.from("products").update({ stock: prod.stock + it.quantity }).eq("id", it.product_id);
      }
    }

    // Delete all old items
    await supabaseAdmin.from("order_items").delete().eq("order_id", data.order_id);

    // Insert new items + recompute total
    let total = 0;
    const newItems = data.items.map(it => {
      total += Number(it.price) * it.quantity;
      return {
        order_id: data.order_id,
        product_id: it.product_id ?? null,
        name: it.name,
        price: it.price,
        quantity: it.quantity,
      };
    });
    const { error: insErr } = await supabaseAdmin.from("order_items").insert(newItems);
    if (insErr) throw new Error(insErr.message);

    // Re-deduct stock if needed
    if (wasStockDeducted) {
      for (const it of newItems) {
        if (!it.product_id) continue;
        const { data: prod } = await supabaseAdmin.from("products").select("stock").eq("id", it.product_id).maybeSingle();
        if (prod) {
          await supabaseAdmin.from("products").update({ stock: Math.max(0, prod.stock - it.quantity) }).eq("id", it.product_id);
          await maybeNotifyLowStock(supabaseAdmin, it.product_id, Number(prod.stock));
        }
      }
    }

    const { error: updErr } = await supabaseAdmin.from("orders").update({
      total,
      notes: data.notes ?? prev.notes,
    }).eq("id", data.order_id);
    if (updErr) throw new Error(updErr.message);

    return { ok: true, total };
  });

export const deleteOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("order_items").delete().eq("order_id", data.id);
    const { error } = await supabaseAdmin.from("orders").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteOldOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    before: z.string().min(1),
    only_completed: z.boolean().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("orders").select("id").lt("created_at", data.before);
    if (data.only_completed) q = q.in("status", ["completed", "cancelled"]);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const ids = (rows ?? []).map((r: any) => r.id);
    if (!ids.length) return { deleted: 0 };
    await supabaseAdmin.from("order_items").delete().in("order_id", ids);
    const { error: delErr } = await supabaseAdmin.from("orders").delete().in("id", ids);
    if (delErr) throw new Error(delErr.message);
    return { deleted: ids.length };
  });
