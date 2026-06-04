import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles").select("id").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("גישה לאדמין בלבד");
}

// ---- Replacement products (admin inventory) ----
export const listReplacementProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("replacement_products").select("*").order("name");
    return Promise.all((data ?? []).map(async (p: any) => ({
      ...p,
      image_url: await resolveImage(supabaseAdmin, p.image_url),
      _raw_image_url: p.image_url,
    })));
  });

const imageUrlSchema = z.string().max(2000).optional().nullable().refine(
  (v) => !v || v.startsWith("http://") || v.startsWith("https://") || v.startsWith("storage:"),
  "כתובת תמונה לא תקינה"
);

const replacementProductSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  image_url: imageUrlSchema,
  active: z.boolean(),
  takin_stock: z.number().int().min(0).max(10_000_000),
  balai_stock: z.number().int().min(0).max(10_000_000),
});

export const upsertReplacementProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => replacementProductSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = { ...data, image_url: data.image_url || null };
    if (data.id) {
      const { error } = await supabaseAdmin.from("replacement_products").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("replacement_products").insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteReplacementProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("replacement_products").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Move stock between buckets or write off
export const adjustReplacementStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      takin_delta: z.number().int().min(-1_000_000).max(1_000_000),
      balai_delta: z.number().int().min(-1_000_000).max(1_000_000),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: p } = await supabaseAdmin
      .from("replacement_products").select("takin_stock, balai_stock").eq("id", data.id).maybeSingle();
    if (!p) throw new Error("פריט לא נמצא");
    const newTakin = Math.max(0, p.takin_stock + data.takin_delta);
    const newBalai = Math.max(0, p.balai_stock + data.balai_delta);
    const { error } = await supabaseAdmin
      .from("replacement_products")
      .update({ takin_stock: newTakin, balai_stock: newBalai })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, takin_stock: newTakin, balai_stock: newBalai };
  });

export const bulkImportReplacementProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    rows: z.array(z.object({
      name: z.string().min(1),
      description: z.string().optional().nullable(),
      category: z.string().optional().nullable(),
      image_url: z.string().optional().nullable(),
      takin_stock: z.number().int().min(0),
      balai_stock: z.number().int().min(0),
    })).min(1).max(2000),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = data.rows.map((r) => ({
      name: r.name,
      description: r.description ?? null,
      category: r.category ?? null,
      image_url: r.image_url || null,
      takin_stock: r.takin_stock,
      balai_stock: r.balai_stock,
      active: true,
    }));
    const { error } = await supabaseAdmin.from("replacement_products").insert(payload);
    if (error) throw new Error(error.message);
    return { inserted: payload.length };
  });

// ---- Replacement requests (admin) ----
export const listReplacementRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ status: z.enum(["awaiting_approval","approved","rejected"]).nullable().optional() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("replacement_requests")
      .select("*, teams(name), replacement_request_items(*)")
      .order("created_at", { ascending: false });
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const decideReplacementRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      decision: z.enum(["approved","rejected"]),
      // Per-item flag: did the team return the broken unit? (only applies on approve)
      return_balai: z.record(z.string().uuid(), z.boolean()).optional(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: req } = await supabaseAdmin
      .from("replacement_requests")
      .select("*, replacement_request_items(*)")
      .eq("id", data.id)
      .single();
    if (!req) throw new Error("בקשה לא נמצאה");
    if (req.status !== "awaiting_approval") throw new Error("הבקשה כבר טופלה");

    if (data.decision === "approved") {
      for (const it of req.replacement_request_items as any[]) {
        if (!it.replacement_product_id) continue;
        const { data: p } = await supabaseAdmin
          .from("replacement_products")
          .select("takin_stock, balai_stock")
          .eq("id", it.replacement_product_id)
          .maybeSingle();
        if (!p) continue;
        const returnBalai = data.return_balai?.[it.id] ?? true;
        const newTakin = Math.max(0, p.takin_stock - it.quantity);
        const newBalai = returnBalai ? p.balai_stock + it.quantity : p.balai_stock;
        await supabaseAdmin
          .from("replacement_products")
          .update({ takin_stock: newTakin, balai_stock: newBalai })
          .eq("id", it.replacement_product_id);
      }
    }

    const { error } = await supabaseAdmin
      .from("replacement_requests")
      .update({
        status: data.decision,
        decided_at: new Date().toISOString(),
        decided_by: context.userId,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
