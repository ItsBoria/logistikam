import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { addVat } from "@/lib/pricing";

const BUCKET = "product-images";
const SIGN_TTL = 60 * 60 * 24 * 7; // 7 days

async function resolveImage(supabaseAdmin: any, url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("storage:")) {
    const path = url.slice("storage:".length);
    const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, SIGN_TTL);
    return data?.signedUrl ?? null;
  }
  return url;
}

async function resolveProductImages(supabaseAdmin: any, products: any[]) {
  return Promise.all(products.map(async (p) => ({ ...p, image_url: await resolveImage(supabaseAdmin, p.image_url) })));
}

// Team PIN login - returns minimal team data if PIN is valid
export const verifyTeamPin = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ pin: z.string().min(1).max(32) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: team, error } = await supabaseAdmin
      .from("teams")
      .select("id, name, monthly_limit, active, contact_phone")
      .eq("pin", data.pin.trim())
      .eq("active", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!team) throw new Error("קוד PIN שגוי או צוות לא פעיל");
    return team;
  });

export const getShopData = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ pin: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: team } = await supabaseAdmin
      .from("teams").select("id, name, monthly_limit, contact_phone")
      .eq("pin", data.pin.trim()).eq("active", true).maybeSingle();
    if (!team) throw new Error("צוות לא תקין");
    const [{ data: products }, { data: spent }] = await Promise.all([
      supabaseAdmin.from("products").select("*").eq("active", true).order("name"),
      supabaseAdmin.rpc("team_month_spent", { _team_id: team.id }),
    ]);
    const resolved = await resolveProductImages(supabaseAdmin, products ?? []);
    return {
      team,
      products: resolved.map((product) => ({
        ...product,
        price: addVat(Number(product.price)),
      })),
      spent: Number(spent ?? 0),
    };
  });

const itemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(999),
});

export const placeOrder = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      pin: z.string().min(1),
      items: z.array(itemSchema).min(1).max(200),
      notes: z.string().max(500).optional(),
      contact_phone: z.string().min(7).max(20),
      ordered_by_name: z.string().min(1).max(100),
    }).parse(input)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: team } = await supabaseAdmin
      .from("teams").select("id, monthly_limit, active")
      .eq("pin", data.pin.trim()).maybeSingle();
    if (!team || !team.active) throw new Error("צוות לא תקין");

    const ids = data.items.map(i => i.product_id);
    const { data: products } = await supabaseAdmin
      .from("products").select("id, name, price, stock, active").in("id", ids);
    if (!products || products.length !== ids.length) throw new Error("חלק מהמוצרים לא נמצאו");

    let total = 0;
    const orderItems = data.items.map(i => {
      const p = products.find(x => x.id === i.product_id)!;
      if (!p.active) throw new Error(`המוצר ${p.name} אינו זמין`);
      if (p.stock < i.quantity) throw new Error(`אין מספיק מלאי עבור ${p.name}`);
      const priceWithVat = addVat(Number(p.price));
      total += priceWithVat * i.quantity;
      return { product_id: p.id, name: p.name, price: priceWithVat, quantity: i.quantity };
    });

    const { data: spentResp } = await supabaseAdmin.rpc("team_month_spent", { _team_id: team.id });
    const spent = Number(spentResp ?? 0);
    const limit = Number(team.monthly_limit);

    const requiresApproval = limit > 0 && spent + total > limit;
    const status = requiresApproval ? "awaiting_approval" : "pending";

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        team_id: team.id,
        total,
        status,
        notes: data.notes,
        contact_phone: data.contact_phone,
        ordered_by_name: data.ordered_by_name,
      })
      .select("id")
      .single();
    if (orderErr || !order) throw new Error(orderErr?.message || "שגיאה ביצירת הזמנה");

    const { error: itemsErr } = await supabaseAdmin
      .from("order_items")
      .insert(orderItems.map(it => ({ ...it, order_id: order.id })));
    if (itemsErr) throw new Error(itemsErr.message);

    if (!requiresApproval) {
      for (const it of orderItems) {
        const p = products.find(x => x.id === it.product_id)!;
        await supabaseAdmin.from("products").update({ stock: p.stock - it.quantity }).eq("id", p.id);
      }
    }

    // Budget threshold push notifications (50/80/100% of monthly limit)
    if (limit > 0) {
      try {
        const newSpent = spent + total;
        const monthDate = new Date();
        monthDate.setUTCDate(1);
        monthDate.setUTCHours(0, 0, 0, 0);
        const month = monthDate.toISOString().slice(0, 10);
        const thresholds = [50, 80, 100];
        for (const t of thresholds) {
          const crossed = newSpent >= (limit * t) / 100;
          if (!crossed) continue;
          const { error: insErr } = await supabaseAdmin
            .from("team_budget_alerts")
            .insert({ team_id: team.id, threshold: t, month });
          if (insErr) continue; // unique-violation = already alerted this month
          const pct = Math.min(100, Math.round((newSpent / limit) * 100));
          const title = t >= 100 ? "חרגת מהמסגרת החודשית" : `ניצול תקציב ${t}%`;
          const body = t >= 100
            ? `הצוות חרג מהמסגרת החודשית. נוצל ${pct}% מתקציב חודש זה.`
            : `הצוות ניצל ${pct}% מהתקציב החודשי.`;
          const { sendPushToTeam } = await import("./push.server");
          await sendPushToTeam(team.id, { title, body, url: "/shop/orders" })
            .catch((e) => console.warn("[budget push] failed:", e?.message));
        }
      } catch (e: any) {
        console.warn("[budget alerts] failed:", e?.message);
      }
    }

    return { order_id: order.id, status, requires_approval: requiresApproval, total };
  });

// Build a cart suggestion from a previous order — returns available items + a list of skipped ones.
export const repeatOrder = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ pin: z.string().min(1), order_id: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: team } = await supabaseAdmin
      .from("teams").select("id").eq("pin", data.pin.trim()).eq("active", true).maybeSingle();
    if (!team) throw new Error("צוות לא תקין");
    const { data: order } = await supabaseAdmin
      .from("orders").select("id, team_id, order_items(product_id, quantity, name)")
      .eq("id", data.order_id).maybeSingle();
    if (!order || order.team_id !== team.id) throw new Error("הזמנה לא נמצאה");

    const productIds = (order.order_items as any[])
      .map((i) => i.product_id)
      .filter((x): x is string => !!x);
    const { data: products } = productIds.length
      ? await supabaseAdmin.from("products").select("id, name, stock, active").in("id", productIds)
      : { data: [] as any[] };

    const available: Array<{ product_id: string; quantity: number }> = [];
    const skipped: string[] = [];
    for (const it of order.order_items as any[]) {
      if (!it.product_id) { skipped.push(it.name); continue; }
      const p = (products ?? []).find((x: any) => x.id === it.product_id);
      if (!p || !p.active) { skipped.push(it.name); continue; }
      const qty = Math.min(Number(it.quantity), Number(p.stock));
      if (qty <= 0) { skipped.push(it.name); continue; }
      available.push({ product_id: it.product_id, quantity: qty });
    }
    return { items: available, skipped };
  });

export const getTeamOrders = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ pin: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: team } = await supabaseAdmin
      .from("teams").select("id, name")
      .eq("pin", data.pin.trim()).eq("active", true).maybeSingle();
    if (!team) throw new Error("צוות לא תקין");
    const { data: orders, error } = await supabaseAdmin
      .from("orders")
      .select("id, created_at, status, total, notes, ordered_by_name, contact_phone, order_items(id, name, price, quantity)")
      .eq("team_id", team.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return {
      team,
      orders: (orders ?? []).map((order) => ({
        ...order,
        total: Number(order.total),
        order_items: (order.order_items ?? []).map((item) => ({
          ...item,
          price: Number(item.price),
        })),
      })),
    };
  });
