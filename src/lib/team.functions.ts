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
      products: resolved,
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

    return { order_id: order.id, status, requires_approval: requiresApproval, total };
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
