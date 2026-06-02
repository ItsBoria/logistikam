// Server-only Twilio SMS helper. Fails silently with a log if Twilio is not configured.
const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

export async function sendSms(to: string, body: string) {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const TWILIO_API_KEY = process.env.TWILIO_API_KEY;
  const FROM = process.env.TWILIO_FROM_NUMBER;
  if (!LOVABLE_API_KEY || !TWILIO_API_KEY || !FROM) {
    console.warn("[sms] Twilio not configured, skipping SMS to", to);
    return { sent: false, reason: "not_configured" };
  }
  try {
    const res = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TWILIO_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: FROM, Body: body }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[sms] Twilio error", res.status, json);
      return { sent: false, reason: `twilio_${res.status}` };
    }
    return { sent: true, sid: json.sid };
  } catch (e) {
    console.error("[sms] exception", e);
    return { sent: false, reason: "exception" };
  }
}
