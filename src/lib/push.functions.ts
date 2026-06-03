import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getVapidPublicKey = createServerFn({ method: "GET" }).handler(async () => {
  return { key: process.env.VAPID_PUBLIC_KEY || "" };
});

const subSchema = z.object({
  pin: z.string().min(1).max(32),
  endpoint: z.string().url().max(2000),
  p256dh: z.string().min(1).max(500),
  auth: z.string().min(1).max(500),
});

export const subscribePush = createServerFn({ method: "POST" })
  .inputValidator((input) => subSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: team } = await supabaseAdmin
      .from("teams").select("id, active").eq("pin", data.pin.trim()).maybeSingle();
    if (!team || !team.active) throw new Error("צוות לא תקין");

    const { error } = await supabaseAdmin
      .from("push_subscriptions")
      .upsert(
        { team_id: team.id, endpoint: data.endpoint, p256dh: data.p256dh, auth: data.auth },
        { onConflict: "endpoint" }
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unsubscribePush = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ endpoint: z.string().url() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", data.endpoint);
    return { ok: true };
  });
