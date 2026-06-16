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
      return { replacement_product_id: p.id, name: p.name, quantity: i.quantity, takin_stock: p.takin_stock };
    });

    const { data: req, error: reqErr } = await supabaseAdmin
      .from("replacement_requests")
      .insert({
        team_id: team.id,
        status: "preparing",
        notes: data.notes,
        contact_phone: data.contact_phone,
        ordered_by_name: data.ordered_by_name,
      })
      .select("id")
      .single();
    if (reqErr || !req) throw new Error(reqErr?.message || "שגיאה ביצירת בקשה");

    const { error: itemsErr } = await supabaseAdmin
      .from("replacement_request_items")
      .insert(lines.map((l) => ({
        replacement_product_id: l.replacement_product_id,
        name: l.name,
        quantity: l.quantity,
        request_id: req.id,
      })));
    if (itemsErr) throw new Error(itemsErr.message);

    // Deduct takin_stock immediately (request is now in fulfillment).
    for (const l of lines) {
      await supabaseAdmin
        .from("replacement_products")
        .update({ takin_stock: Math.max(0, l.takin_stock - l.quantity) })
        .eq("id", l.replacement_product_id);
    }

    // Notify admins about the new replacement request (best-effort).
    try {
      const { data: teamRow } = await supabaseAdmin
        .from("teams").select("name").eq("id", team.id).maybeSingle();
      const teamName = (teamRow as any)?.name ?? "צוות";
      const itemsLine = lines.map((l) => `${l.name}×${l.quantity}`).join(", ");
      const trimmed = itemsLine.length > 120 ? itemsLine.slice(0, 117) + "..." : itemsLine;
      const { sendPushToAdmins } = await import("./admin-push.server");
      await sendPushToAdmins("replacement_request", {
        title: "בקשת החלפה חדשה",
        body: `${teamName} (${data.ordered_by_name}): ${trimmed}`,
        url: "/admin/replacements",
      });
    } catch (e: any) {
      console.warn("[admin notify replacement] failed:", e?.message);
    }

    return { request_id: req.id, status: "preparing" as const };
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
      .select("id, created_at, status, notes, ordered_by_name, contact_phone, replacement_request_items(id, replacement_product_id, name, quantity)")
      .eq("team_id", team.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { team, requests: requests ?? [] };
  });

// ---- Team-side edit / delete while status is 'preparing' ----

async function loadOwnEditableRequest(supabaseAdmin: any, pin: string, request_id: string) {
  const { data: team } = await supabaseAdmin
    .from("teams").select("id, active").eq("pin", pin.trim()).maybeSingle();
  if (!team || !team.active) throw new Error("צוות לא תקין");
  const { data: req } = await supabaseAdmin
    .from("replacement_requests")
    .select("id, team_id, status, replacement_request_items(id, replacement_product_id, name, quantity)")
    .eq("id", request_id).maybeSingle();
  if (!req || req.team_id !== team.id) throw new Error("הבקשה לא נמצאה");
  if (req.status !== "preparing") throw new Error("לא ניתן לערוך בקשה זו");
  return { team, req } as const;
}

async function restoreReplacementStock(supabaseAdmin: any, items: any[]) {
  for (const it of items) {
    if (!it.replacement_product_id) continue;
    const { data: p } = await supabaseAdmin
      .from("replacement_products").select("takin_stock").eq("id", it.replacement_product_id).maybeSingle();
    if (!p) continue;
    await supabaseAdmin
      .from("replacement_products")
      .update({ takin_stock: Number(p.takin_stock) + Number(it.quantity) })
      .eq("id", it.replacement_product_id);
  }
}

export const deleteReplacementRequest = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ pin: z.string().min(1), request_id: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { req } = await loadOwnEditableRequest(supabaseAdmin, data.pin, data.request_id);
    await restoreReplacementStock(supabaseAdmin, req.replacement_request_items as any[]);
    await supabaseAdmin.from("replacement_request_items").delete().eq("request_id", req.id);
    const { error } = await supabaseAdmin.from("replacement_requests").delete().eq("id", req.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const editReplacementRequest = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      pin: z.string().min(1),
      request_id: z.string().uuid(),
      items: z.array(itemSchema).min(1).max(50),
      notes: z.string().max(500).optional(),
      contact_phone: z.string().min(7).max(20).optional(),
      ordered_by_name: z.string().min(1).max(100).optional(),
    }).parse(input)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { req } = await loadOwnEditableRequest(supabaseAdmin, data.pin, data.request_id);

    // Restore old stock
    await restoreReplacementStock(supabaseAdmin, req.replacement_request_items as any[]);

    const ids = data.items.map((i) => i.replacement_product_id);
    const { data: products } = await supabaseAdmin
      .from("replacement_products").select("id, name, active, takin_stock").in("id", ids);
    if (!products || products.length !== ids.length) throw new Error("חלק מהפריטים לא נמצאו");

    const lines = data.items.map((i) => {
      const p = products.find((x: any) => x.id === i.replacement_product_id)!;
      if (!p.active) throw new Error(`הפריט ${p.name} אינו זמין`);
      if (Number(p.takin_stock) < i.quantity) throw new Error(`אין מספיק מלאי תקין עבור ${p.name}`);
      return { replacement_product_id: p.id, name: p.name, quantity: i.quantity, takin_stock: Number(p.takin_stock) };
    });

    // Replace items
    await supabaseAdmin.from("replacement_request_items").delete().eq("request_id", req.id);
    const { error: insErr } = await supabaseAdmin
      .from("replacement_request_items")
      .insert(lines.map((l) => ({
        replacement_product_id: l.replacement_product_id,
        name: l.name,
        quantity: l.quantity,
        request_id: req.id,
      })));
    if (insErr) throw new Error(insErr.message);

    // Update header fields if provided
    const updateFields: any = {};
    if (data.notes !== undefined) updateFields.notes = data.notes;
    if (data.contact_phone !== undefined) updateFields.contact_phone = data.contact_phone;
    if (data.ordered_by_name !== undefined) updateFields.ordered_by_name = data.ordered_by_name;
    if (Object.keys(updateFields).length > 0) {
      const { error: updErr } = await supabaseAdmin
        .from("replacement_requests").update(updateFields).eq("id", req.id);
      if (updErr) throw new Error(updErr.message);
    }

    // Deduct new stock
    for (const l of lines) {
      await supabaseAdmin
        .from("replacement_products")
        .update({ takin_stock: Math.max(0, l.takin_stock - l.quantity) })
        .eq("id", l.replacement_product_id);
    }

    return { ok: true };
  });
