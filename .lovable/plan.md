
# Push notifications — full reset

## What's broken now
- "String contains invalid characters" happens in the browser at `pushManager.subscribe(...)` — almost always means the VAPID public key isn't a valid base64url 65‑byte P‑256 key. Sanitizing characters can't fix a wrong key; we need a real, matching key pair.
- iPhone needs the site installed to the home screen ("Add to Home Screen") before web push works at all — today there's no manifest, so iOS install is unreliable.

## The plan

### 1. Generate a real VAPID key pair
- Generate a fresh P‑256 VAPID public/private pair (using `web-push`).
- You update three project secrets with the new values:
  - `VAPID_PUBLIC_KEY` (base64url, ~87 chars, starts with `B`)
  - `VAPID_PRIVATE_KEY`
  - `VAPID_SUBJECT` (e.g. `mailto:davidpanasik@hotmail.com`)
- Old subscriptions become invalid → wipe the `push_subscriptions` table once so every device re‑subscribes against the new key.

### 2. Rebuild the push code from scratch
- New `public/sw.js` (clean push + notificationclick handler, RTL, opens `/shop/orders`).
- New `src/lib/push-client.ts` with one function per action: `enablePush(pin)`, `disablePush()`, `getPushState()`. No string sanitization hacks — proper base64url → Uint8Array conversion only.
- New `src/lib/push.functions.ts`:
  - `getVapidPublicKey` returns the raw key (no character stripping).
  - `subscribePush` / `unsubscribePush` write to `push_subscriptions` keyed by endpoint.
- New `src/lib/push.server.ts` `sendPushToTeam` (kept, cleaned up; drops 404/410 subs automatically).
- Replace the push UI block in `src/routes/shop.index.tsx` with a single `<PushToggle />` component that shows the right state: not‑supported / needs‑install (iOS) / off / on / busy, with clear Hebrew messages.

### 3. Make iPhone push actually possible
- Add `public/manifest.webmanifest` (name, short_name, theme/background color, `display: "standalone"`, `start_url: "/shop"`, icons 192/512).
- Add manifest + apple-touch-icon + theme-color tags in `__root.tsx` head.
- Reuse existing favicon as the icon (no new art) unless you want a custom one later.
- On iOS Safari (not installed): show a clear instruction card ("שתף → הוסף למסך הבית, ואז פתחו את האפליקציה והפעילו התראות").
- After install on iPhone (iOS 16.4+), the same `enablePush` flow works.

### 4. Verify
- Android Chrome: enable → permission prompt → success toast → test push from admin.
- iPhone: install to home screen → open app → enable → test push.
- Send a test push from the admin orders page (already wired via `sendPushToTeam` on new orders); add a small "שלח התראת בדיקה" button per team in admin to make verification easy.

## What you need to do
1. Approve this plan.
2. After I generate the new keys, I'll ask you to paste the three values into the secret prompts (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`).
3. On every device that previously tried to enable push, toggle it off and on once after the update.

## Technical notes
- `urlBase64ToUint8Array` will only pad and translate `-_` → `+/`; no character stripping. If the key is bad we'll throw a clear error instead of silently corrupting it.
- VAPID key length check on the server (`getVapidPublicKey` throws if not ~87 chars / decodes to 65 bytes) so misconfiguration surfaces immediately.
- Migration: `delete from public.push_subscriptions;` so stale endpoints tied to the old key don't 403 on send.
- No changes to orders, VAT, or admin cleanup features.
