## Goal
Let teams **edit** or **cancel** their own orders and replacement requests after submission — as long as the warehouse hasn't started handling them.

## When edit/cancel is allowed

| Type | Editable / cancellable while status is | Locked once status becomes |
|---|---|---|
| Order | `pending`, `awaiting_approval` | `approved`, `preparing`, `ready`, `completed`, `cancelled` |
| Replacement request | `preparing` (initial) | `ready`, `done`, `cancelled` |

(Admin can still override anything from `/admin/orders` and `/admin/replacements`.)

## Backend

### `src/lib/team.functions.ts`
- **`cancelOrder({ pin, order_id })`**
  - Validates team owns the order and status ∈ {pending, awaiting_approval}.
  - If status was `pending`, restore stock for each item (was deducted on placement).
  - Sets status to `cancelled`.
- **`editOrder({ pin, order_id, items[], notes?, contact_phone?, ordered_by_name? })`**
  - Same status check.
  - Items can have qty changed or be removed; at least 1 item must remain.
  - Restore stock for old items (if status was `pending`), validate + recompute total from current product prices, write new `order_items`, deduct stock again (if not awaiting approval).
  - Recompute `awaiting_approval` vs `pending` against monthly limit (same rule as `placeOrder`).

### `src/lib/replacements.functions.ts`
- **`deleteReplacementRequest({ pin, request_id })`**
  - Status must be `preparing`. Restores `takin_stock` for every item, then deletes items + request.
- **`editReplacementRequest({ pin, request_id, items[], notes?, contact_phone?, ordered_by_name? })`**
  - Status must be `preparing`. Items can have qty changed or be removed; at least 1 must remain.
  - Restore takin_stock for old items, validate new quantities against available takin_stock, write new items, deduct new takin_stock.

All four fns mirror the existing pin-based auth in `placeOrder` / `submitReplacementRequest`.

## Frontend

### `src/routes/shop.orders.tsx`
For each order with editable status, render two buttons next to the status badge:
- **בטל** — confirm dialog → `cancelOrder`.
- **ערוך** — dialog with each item as a row: name, qty stepper (min 0; 0 removes the item), live total preview. Optional notes/phone/name fields prefilled. Save → `editOrder`.
After success: toast + invalidate `["team-orders"]`.

### `src/routes/shop.replacements.tsx`
For each request with status `preparing`, render:
- **מחק** — confirm dialog → `deleteReplacementRequest`.
- **ערוך** — dialog with per-item qty stepper (0 = remove). Save → `editReplacementRequest`.
After success: toast + invalidate `["team-replacement-requests"]`.

Both dialogs use existing shadcn `Dialog`, `Button`, `Input` patterns. RTL preserved. No new colors.

## Out of scope
- Adding brand-new products into an existing order/request via the edit dialog (only qty changes + item removal). Can be added later if requested.
- No schema changes.
