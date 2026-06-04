## Goal

1. **Per-product low-stock threshold** with a global default.
2. **Replacement system** — separate from budget shop, with its own admin-only inventory split into **תקין** (good/usable) and **בלאי** (worn/broken) stock. Teams only see items with תקין stock available. All replacement requests require admin approval before stock moves.

---

## Part 1 — Low-stock thresholds

### Schema
- `products.low_stock_threshold` (int, nullable) — per-product override.
- `app_settings` table (key/value) with row `default_low_stock_threshold` (default 5).

### Admin UI
- **Product editor** (`admin.products.tsx`): new field "סף מלאי נמוך" (number; placeholder shows the global default; empty = use default).
- **Dashboard/settings**: small form to edit the global default.
- **Product card + dashboard KPIs**: highlight items where `stock <= (low_stock_threshold ?? global_default)` in red and add a "מלאי נמוך" count tile.

No team-facing change.

---

## Part 2 — Replacement system (separate from budget)

### Concept
Parallel mini-shop for replacements. Own catalog, own inventory. **Not** tied to monthly budget. Two internal buckets per replacement item:
- **`takin_stock`** (תקין) — usable replacement units.
- **`balai_stock`** (בלאי) — worn/broken units, admin-only visibility.

Teams only ever see items with `takin_stock > 0`.

### Schema (new tables)
```
replacement_products
  id, name, description, category, image_url, active,
  takin_stock int default 0,   -- תקין
  balai_stock int default 0,   -- בלאי
  created_at, updated_at

replacement_requests
  id, team_id, status ('awaiting_approval' | 'approved' | 'rejected'),
  ordered_by_name, contact_phone, notes,
  created_at, updated_at, decided_at, decided_by

replacement_request_items
  id, request_id, replacement_product_id, name, quantity
```

RLS: admin-only on all three; teams reach them through server fns using their PIN (same pattern as orders).

### Team flow (`/shop/replacements` — new tab in shop)
- Tab next to "חנות" and "הזמנות": **"החלפות"**.
- Lists active replacement products with `takin_stock > 0` (stock count hidden — just "זמין" / "אזל").
- Add to cart → fill name + phone + short reason → submit.
- Creates `replacement_requests` row with status `awaiting_approval`. **No stock change yet, no budget check.**
- Shows team's own replacement-request history with status badges.

### Admin flow
- **`/admin/replacements`** — list of requests with filters (ממתין / אושר / נדחה).
  - Approve → decrement `takin_stock` per line and (per-line checkbox "הוחזר פריט בלאי?" default on) increment `balai_stock` by the same qty.
  - Reject → no stock change.
  - Final, logged with timestamp + admin id.
- **`/admin/replacement-inventory`** — manage `replacement_products`: name/desc/image/active + two stock fields side-by-side labeled **תקין** and **בלאי**. Quick actions:
  - "העבר מבלאי לתקין" (move N from בלאי → תקין, e.g. after repair).
  - "סמן כפסולת" (decrement בלאי).
  - Bulk import via Excel like products page.
- **Admin nav** (`admin-shell.tsx`): add "החלפות" and "מלאי החלפות" links.
- **Dashboard**: add KPI tile "בקשות החלפה ממתינות".

### Server functions (new)
`src/lib/replacements.functions.ts`
- `getReplacementShop({ pin })` — team-facing catalog (only active + `takin_stock>0`, stock count masked).
- `submitReplacementRequest({ pin, items, ordered_by_name, contact_phone, notes })`.
- `getTeamReplacementRequests({ pin })`.

`src/lib/replacement-admin.functions.ts`
- `listReplacementProducts`, `upsertReplacementProduct`, `deleteReplacementProduct`, `adjustReplacementStock({ id, takin_delta, balai_delta })`, `bulkImportReplacementProducts`.
- `listReplacementRequests({ status? })`, `decideReplacementRequest({ id, decision, return_balai_per_item })`.

All admin fns gated by `requireSupabaseAuth` + admin role check (same pattern as existing `admin.functions.ts`).

---

## Out of scope
- No payment / pricing on replacements (free by design).
- No notifications on replacement decisions in v1 (can reuse `push.server.ts` later).
- No edits to budget/order flow.

## Files to add
- `supabase/migrations/<ts>_low_stock_and_replacements.sql`
- `src/lib/replacements.functions.ts`
- `src/lib/replacement-admin.functions.ts`
- `src/routes/shop.replacements.tsx`
- `src/routes/admin.replacements.tsx`
- `src/routes/admin.replacement-inventory.tsx`

## Files to edit
- `src/routes/admin.products.tsx` (threshold field)
- `src/routes/admin.index.tsx` (low-stock KPI + pending-replacements KPI + global threshold setting)
- `src/lib/admin-dashboard.functions.ts` (new KPIs)
- `src/lib/admin.functions.ts` (persist threshold; settings get/set)
- `src/components/admin-shell.tsx` (two new nav links)
- `src/routes/shop.index.tsx` (tab link to replacements)
