import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getVapidPublicKey = createServerFn({ method: "GET" }).handler(async () => {
  const key = (process.env.VAPID_PUBLIC_KEY || "").trim();
  if (!key) return { key: "", error: "VAPID_PUBLIC_KEY לא הוגדר בשרת" };
  if (!/^[A-Za-z0-9_-]+$/.test(key)) {
    return { key: "", error: "VAPID_PUBLIC_KEY מכיל תווים לא חוקיים" };
  }
  return { key };
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

export const sendTestPush = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ pin: z.string().min(1).max(32) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: team } = await supabaseAdmin
      .from("teams").select("id, name").eq("pin", data.pin.trim()).maybeSingle();
    if (!team) throw new Error("צוות לא תקין");
    const { sendPushToTeam } = await import("@/lib/push.server");
    const res = await sendPushToTeam(team.id, {
      title: "התראת בדיקה",
      body: `שלום ${team.name}, ההתראות פועלות 🎉`,
      url: "/shop/orders",
    });
    if (res.sent === 0 && res.error) {
      throw new Error(res.error);
    }
    return res;
  });
