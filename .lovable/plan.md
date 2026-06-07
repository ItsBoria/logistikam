## Goal

Add granular admin roles, unified login for everyone, admin-side notifications (new orders / low stock / etc.), per-admin notification preferences, and surface the current low-stock list.

Current low-stock products (live):
- **איזו דק (לרשום צבע בהערות)** — stock 0 / threshold 2 (קטגוריה: קרביץ)

That's the only product currently at or below threshold.

---

## 1. Unified login + role-based routing

Today there are two entrances: `/admin/login` (Supabase email/username) and the team PIN at `/`. We keep both auth mechanisms (admins use Supabase, shop teams use a team PIN — different identity models, can't be merged), but unify the **landing page**:

- `/` becomes a single "Sign in" page with two tabs: **צוות (PIN)** and **מנהל / צוות-מחסן**.
- After admin login, route by role:
  - `admin` → `/admin` (full dashboard)
  - `staff` → `/admin/orders` (limited view, see §2)
- After team PIN, behavior is unchanged → `/shop`.
- `/admin/login` stays as a deep-link alias that just redirects to `/` with the admin tab pre-selected.

## 2. New `staff` role (limited admin)

Add `'staff'` to the `app_role` enum. A staff user can:

- View & update **order status** (`/admin/orders`)
- View products and **edit stock + low_stock_threshold only** (a slim variant of `/admin/products`)
- View **low stock list** (read-only on `/admin` dashboard)

A staff user **cannot**:

- Create/edit/delete products (other than stock fields), teams, replacements inventory, admins, or app settings
- See revenue/financial KPIs

Implementation:

- New DB enum value + `has_role(uid, 'staff')` checks.
- New server fns: `updateProductStock`, `staffListOrders`, `staffUpdateOrderStatus` — all gated by `has_role(uid,'admin') OR has_role(uid,'staff')`. Existing admin-only fns keep the strict admin check.
- `AdminShell` nav is filtered by role: staff sees only **הזמנות**, **מלאי**, **התראות**. Direct URL access to forbidden routes shows "אין הרשאה".
- `/admin/users` page adds a role selector (admin/staff) when creating a user.

## 3. Admin notifications

New table `admin_notification_prefs` (per user × event type, default ON for admins, OFF for staff except `low_stock`).

Event types:
- `order_created` — fires when shop submits a new order
- `order_awaiting_approval` — over-budget order needs admin approval
- `low_stock` — product hits/crosses its threshold
- `replacement_request` — team submits a new replacement request

Delivery: Web Push (reuses existing VAPID setup). New `admin_push_subscriptions` table mirroring `push_subscriptions` but keyed by `user_id` instead of `team_id`. Admins enable push from a new **"התראות"** screen in the admin panel (Bell icon, same UX as the shop's "עוד" sheet).

Server-side:
- New helper `sendPushToAdmins(eventType, payload)` — looks up admins/staff whose pref is ON for `eventType`, fans out via web-push.
- Wire it into existing order/replacement creation handlers and into a stock-decrement check that fires `low_stock` when `stock` crosses below `effective_threshold`.

## 4. New "התראות" admin screen

`/admin/notifications`:
- "הפעל התראות בדפדפן" button (subscribe/unsubscribe the current device)
- Toggle list of the 4 event types — saves to `admin_notification_prefs`
- A **"מלאי נמוך כעת"** card listing every product at/below threshold (live query, same logic as the dashboard's low-stock card, but full list — not capped at 10)

Also added to `/admin` dashboard: a "מלאי נמוך" tab that links here for the full list.

---

## Technical details

**DB migration:**
1. `ALTER TYPE app_role ADD VALUE 'staff'`
2. `CREATE TABLE admin_notification_prefs (user_id uuid, event_type text, enabled boolean, PRIMARY KEY (user_id, event_type))` + RLS: users manage own rows, admins read all
3. `CREATE TABLE admin_push_subscriptions (id, user_id, endpoint UNIQUE, p256dh, auth, created_at)` + RLS: users manage own; service_role full
4. GRANTs to `authenticated` + `service_role` on both tables (no `anon`)
5. Backfill: insert default prefs for existing admins (all ON)

**New server fns (`src/lib/admin-notifications.functions.ts`):**
- `subscribeAdminPush`, `unsubscribeAdminPush`, `getMyNotificationPrefs`, `setMyNotificationPref`, `sendTestAdminPush`, `getLowStockList`

**Notification hook points (existing files):**
- `src/lib/team.functions.ts` — order creation → fires `order_created` / `order_awaiting_approval`
- `src/lib/replacements.functions.ts` — request creation → `replacement_request`
- `src/lib/admin.functions.ts` `upsertProduct` + `updateOrderStatus` (stock deduction path) → `low_stock` when crossing threshold

**Role plumbing:**
- `src/hooks/use-supabase-session.ts` → extend to also fetch `roles: ('admin'|'staff')[]` cached in React Query
- `src/components/admin-shell.tsx` → accept allowed roles, filter nav, guard route
- New `src/components/staff-product-stock-table.tsx` for the limited products page

**Unified login:**
- Rewrite `src/routes/index.tsx` to render `<Tabs>` with team-PIN form (current `/` content) and admin form (current `/admin/login` content). Post-login redirect logic checks roles and routes accordingly.
- `/admin/login` becomes a thin redirect to `/?tab=admin`.

**Service worker (`public/sw.js`):** already handles push payloads generically — no changes needed.

---

## Out of scope (call out, but not building)

- SMS notifications for admins (push only for now; can add later via existing `sms.server.ts`)
- Granular per-team filtering of admin notifications
- Email digests
