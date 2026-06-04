import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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

// Team-facing catalog: only items with takin_stock > 0; stock count masked.
export const getReplacementShop = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ pin: z.string().min(1).max(32) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: team } = await supabaseAdmin
      .from("teams").select("id, name, contact_phone")
      .eq("pin", data.pin.trim()).eq("active", true).maybeSingle();
    if (!team) throw new Error("צוות לא תקין");
    const { data: products } = await supabaseAdmin
      .from("replacement_products")
      .select("id, name, description, category, image_url, takin_stock")
      .eq("active", true)
      .gt("takin_stock", 0)
      .order("name");
    const resolved = await Promise.all((products ?? []).map(async (p: any) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      category: p.category,
      image_url: await resolveImage(supabaseAdmin, p.image_url),
      available: true, // mask exact count
    })));
    return { team, products: resolved };
  });

const itemSchema = z.object({
  replacement_product_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(99),
});

export const submitReplacementRequest = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      pin: z.string().min(1),
      items: z.array(itemSchema).min(1).max(50),
      notes: z.string().max(500).optional(),
      contact_phone: z.string().min(7).max(20),
      ordered_by_name: z.string().min(1).max(100),
    }).parse(input)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: team } = await supabaseAdmin
      .from("teams").select("id, active").eq("pin", data.pin.trim()).maybeSingle();
    if (!team || !team.active) throw new Error("צוות לא תקין");

    const ids = data.items.map((i) => i.replacement_product_id);
    const { data: products } = await supabaseAdmin
      .from("replacement_products").select("id, name, active, takin_stock").in("id", ids);
    if (!products || products.length !== ids.length) throw new Error("חלק מהפריטים לא נמצאו");

    const lines = data.items.map((i) => {
      const p = products.find((x: any) => x.id === i.replacement_product_id)!;
      if (!p.active) throw new Error(`הפריט ${p.name} אינו זמין`);
      if (p.takin_stock < i.quantity) throw new Error(`אין מספיק מלאי תקין עבור ${p.name}`);
      return { replacement_product_id: p.id, name: p.name, quantity: i.quantity };
    });

    const { data: req, error: reqErr } = await supabaseAdmin
      .from("replacement_requests")
      .insert({
        team_id: team.id,
        status: "awaiting_approval",
        notes: data.notes,
        contact_phone: data.contact_phone,
        ordered_by_name: data.ordered_by_name,
      })
      .select("id")
      .single();
    if (reqErr || !req) throw new Error(reqErr?.message || "שגיאה ביצירת בקשה");

    const { error: itemsErr } = await supabaseAdmin
      .from("replacement_request_items")
      .insert(lines.map((l) => ({ ...l, request_id: req.id })));
    if (itemsErr) throw new Error(itemsErr.message);

    return { request_id: req.id, status: "awaiting_approval" as const };
  });

export const getTeamReplacementRequests = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ pin: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: team } = await supabaseAdmin
      .from("teams").select("id, name")
      .eq("pin", data.pin.trim()).eq("active", true).maybeSingle();
    if (!team) throw new Error("צוות לא תקין");
    const { data: requests, error } = await supabaseAdmin
      .from("replacement_requests")
      .select("id, created_at, status, notes, ordered_by_name, contact_phone, replacement_request_items(id, name, quantity)")
      .eq("team_id", team.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { team, requests: requests ?? [] };
  });
