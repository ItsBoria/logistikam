import webpush from "web-push";

let configured = false;
function ensureConfigured() {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:davidpanasik@hotmail.com";
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

export async function sendPushToTeam(teamId: string, payload: { title: string; body: string; url?: string }) {
  if (!ensureConfigured()) {
    console.warn("[push] VAPID keys missing; skipping send");
    return { sent: 0, removed: 0 };
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions").select("*").eq("team_id", teamId);
  if (!subs?.length) return { sent: 0, removed: 0 };

  let sent = 0, removed = 0;
  const body = JSON.stringify(payload);
  await Promise.all(subs.map(async (s: any) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body
      );
      sent++;
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await supabaseAdmin.from("push_subscriptions").delete().eq("id", s.id);
        removed++;
      } else {
        console.error("[push] send failed:", err?.statusCode, err?.message);
      }
    }
  }));
  return { sent, removed };
}
