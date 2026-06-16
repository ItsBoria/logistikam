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
        const newStock = p.stock - it.quantity;
        await supabaseAdmin.from("products").update({ stock: newStock }).eq("id", p.id);
        // Low-stock admin notification if this deduction crossed the threshold.
        try {
          const { data: full } = await supabaseAdmin
            .from("products").select("id, name, low_stock_threshold, active").eq("id", p.id).maybeSingle();
          if (full?.active) {
            const { data: settingRow } = await supabaseAdmin
              .from("app_settings").select("value").eq("key", "default_low_stock_threshold").maybeSingle();
            const defaultThreshold = Number((settingRow?.value as any) ?? 5);
            const threshold = full.low_stock_threshold ?? defaultThreshold;
            if (p.stock > threshold && newStock <= threshold) {
              const { sendPushToAdmins } = await import("./admin-push.server");
              await sendPushToAdmins("low_stock", {
                title: newStock === 0 ? "מוצר אזל מהמלאי" : "התראת מלאי נמוך",
                body: `${full.name} — נשאר ${newStock} (סף ${threshold})`,
                url: "/admin/notifications",
              });
            }
          }
        } catch (e: any) {
          console.warn("[low stock notify on order] failed:", e?.message);
        }
      }
    }

    // Notify admins about the new order (best-effort, async).
    try {
      const { sendPushToAdmins } = await import("./admin-push.server");
      const itemsLine = orderItems.map((i) => `${i.name}×${i.quantity}`).join(", ");
      const trimmed = itemsLine.length > 120 ? itemsLine.slice(0, 117) + "..." : itemsLine;
      if (requiresApproval) {
        await sendPushToAdmins("order_awaiting_approval", {
          title: "הזמנה ממתינה לאישור",
          body: `${data.ordered_by_name}: ₪${total.toFixed(0)} — ${trimmed}`,
          url: "/admin/orders",
        });
      } else {
        await sendPushToAdmins("order_created", {
          title: "הזמנה חדשה",
          body: `${data.ordered_by_name}: ₪${total.toFixed(0)} — ${trimmed}`,
          url: "/admin/orders",
        });
      }
    } catch (e: any) {
      console.warn("[admin notify new order] failed:", e?.message);
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

// ---- Team-side edit / cancel for orders still in pending/awaiting_approval ----

const editableOrderStatuses = ["pending", "awaiting_approval"] as const;
type EditableOrderStatus = typeof editableOrderStatuses[number];

async function loadOwnEditableOrder(supabaseAdmin: any, pin: string, order_id: string) {
  const { data: team } = await supabaseAdmin
    .from("teams").select("id, monthly_limit, active").eq("pin", pin.trim()).maybeSingle();
  if (!team || !team.active) throw new Error("צוות לא תקין");
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, team_id, status, total, order_items(id, product_id, name, price, quantity)")
    .eq("id", order_id).maybeSingle();
  if (!order || order.team_id !== team.id) throw new Error("הזמנה לא נמצאה");
  if (!editableOrderStatuses.includes(order.status as EditableOrderStatus)) {
    throw new Error("לא ניתן לערוך הזמנה זו");
  }
  return { team, order } as const;
}

async function restoreStockForItems(supabaseAdmin: any, items: any[]) {
  for (const it of items) {
    if (!it.product_id) continue;
    const { data: p } = await supabaseAdmin
      .from("products").select("stock").eq("id", it.product_id).maybeSingle();
    if (!p) continue;
    await supabaseAdmin
      .from("products").update({ stock: Number(p.stock) + Number(it.quantity) })
      .eq("id", it.product_id);
  }
}

export const cancelOrder = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ pin: z.string().min(1), order_id: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { order } = await loadOwnEditableOrder(supabaseAdmin, data.pin, data.order_id);
    if (order.status === "pending") {
      await restoreStockForItems(supabaseAdmin, order.order_items as any[]);
    }
    const { error } = await supabaseAdmin
      .from("orders").update({ status: "cancelled" }).eq("id", order.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const editOrder = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      pin: z.string().min(1),
      order_id: z.string().uuid(),
      items: z.array(itemSchema).min(1).max(200),
      notes: z.string().max(500).optional(),
      contact_phone: z.string().min(7).max(20).optional(),
      ordered_by_name: z.string().min(1).max(100).optional(),
    }).parse(input)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { team, order } = await loadOwnEditableOrder(supabaseAdmin, data.pin, data.order_id);

    // Restore prior stock if we'd deducted it
    if (order.status === "pending") {
      await restoreStockForItems(supabaseAdmin, order.order_items as any[]);
    }

    const ids = data.items.map((i) => i.product_id);
    const { data: products } = await supabaseAdmin
      .from("products").select("id, name, price, stock, active").in("id", ids);
    if (!products || products.length !== ids.length) throw new Error("חלק מהמוצרים לא נמצאו");

    let total = 0;
    const newItems = data.items.map((i) => {
      const p = products.find((x: any) => x.id === i.product_id)!;
      if (!p.active) throw new Error(`המוצר ${p.name} אינו זמין`);
      if (Number(p.stock) < i.quantity) throw new Error(`אין מספיק מלאי עבור ${p.name}`);
      const priceWithVat = addVat(Number(p.price));
      total += priceWithVat * i.quantity;
      return { order_id: order.id, product_id: p.id, name: p.name, price: priceWithVat, quantity: i.quantity };
    });

    // Recompute status against monthly limit, excluding this order's current total
    const { data: spentResp } = await supabaseAdmin.rpc("team_month_spent", { _team_id: team.id });
    const spentOthers = Math.max(0, Number(spentResp ?? 0) - Number(order.total));
    const limit = Number(team.monthly_limit);
    const requiresApproval = limit > 0 && spentOthers + total > limit;
    const newStatus = requiresApproval ? "awaiting_approval" : "pending";

    // Replace items
    await supabaseAdmin.from("order_items").delete().eq("order_id", order.id);
    const { error: insErr } = await supabaseAdmin.from("order_items").insert(newItems);
    if (insErr) throw new Error(insErr.message);

    // Update order
    const updateFields: any = { total, status: newStatus };
    if (data.notes !== undefined) updateFields.notes = data.notes;
    if (data.contact_phone !== undefined) updateFields.contact_phone = data.contact_phone;
    if (data.ordered_by_name !== undefined) updateFields.ordered_by_name = data.ordered_by_name;
    const { error: updErr } = await supabaseAdmin
      .from("orders").update(updateFields).eq("id", order.id);
    if (updErr) throw new Error(updErr.message);

    // Deduct stock for new items if status is pending
    if (newStatus === "pending") {
      for (const it of newItems) {
        const p = products.find((x: any) => x.id === it.product_id)!;
        await supabaseAdmin
          .from("products").update({ stock: Number(p.stock) - it.quantity })
          .eq("id", it.product_id);
      }
    }

    return { ok: true, status: newStatus, total };
  });
