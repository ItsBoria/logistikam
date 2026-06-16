# Improvement Ideas for the Admin Panel

Below are concrete improvements grouped by impact. Tell me which ones to build (you can pick any combination) and I'll come back with a focused implementation plan.

## 1. Invoice / Order Document Export (your explicit ask)
- Per-order **"Download Invoice"** button in `admin.orders.tsx` and in the team's `shop.orders.tsx` history.
- Formats: **PDF** (default, using `jspdf` + `jspdf-autotable`, full RTL Hebrew support) and **DOCX** (using `docx` lib) — user picks from a small dropdown on the button.
- Contents: team name, contact + phone, ordered-by name, order #, date, status, line items table (name / qty / price / line total), subtotal, notes, and a footer with company/branding from `app_settings`.
- Bulk export: select multiple orders → "Download all as ZIP" (PDFs merged or zipped).
- Monthly statement per team: one PDF summarizing all orders in a chosen month with totals vs. monthly limit.

## 2. Better Order Visibility for Admins
- **Dashboard widgets on `admin.index`**: today's orders count, awaiting-approval count, low-stock items, teams over 80% of monthly budget, replacement requests pending.
- **Inline order detail drawer** instead of only the edit dialog — shows full item list, team budget usage, prior orders from same team, and a status timeline.
- **Status timeline / audit log** on each order (who changed status and when). Requires a small `order_status_history` table.
- **Color-coded row highlights** for urgent states (awaiting_approval > 24h, ready > 48h not picked up).
- **Sticky filter bar + saved filter presets** ("Today", "This week", "Awaiting approval", per team).
- **Search box** by order #, team name, contact phone, or item name.
- **Column sort + pagination** (current list can get long); virtualized scrolling for big result sets.

## 3. Order Workflow Quality-of-Life
- **Quick-action buttons** per row (Approve / Mark Ready / Complete) instead of opening the status dropdown each time.
- **Bulk actions**: select N orders → bulk approve / mark ready / export.
- **Print-friendly "Picking slip"** view for warehouse staff — large fonts, checkboxes per item, grouped by storage location.
- **Reject / Cancel with reason** — captured note shown to the team.
- **Internal admin notes** field on each order (not visible to team).
- **Auto-notify team** (push + optional email) on every status change, with a templated message.

## 4. Reporting & Insights
- **CSV/Excel export already exists**; add **PDF summary report** for a date range with charts (orders per team, top products, spend vs. budget).
- **Top products** and **slow movers** views to inform stocking decisions.
- **Team scorecard**: avg order size, cancellation rate, replacement request rate.

## 5. Replacements Panel Parity
- Same invoice-style export for replacement requests.
- Group replacement requests by product for the inventory team ("you need to prep X of item Y across 4 teams").

## 6. Small but high-value polish
- Keyboard shortcuts (e.g. `a` approve, `r` ready, `/` focus search).
- Persist last-used filters in `localStorage`.
- Toast with "Undo" after status changes / deletions.
- Empty-state illustrations and clearer loading skeletons.

---

## Recommended first slice (if you want me to just pick)
1. **PDF + DOCX invoice download** on each order (admin + team views), branded from `app_settings`.
2. **Admin dashboard widgets** (today / awaiting / low stock / over-budget teams).
3. **Order detail drawer** with status timeline + internal admin notes.
4. **Quick-action buttons + search box + saved filter presets** on the orders list.

### Technical notes for the first slice
- Add deps: `jspdf`, `jspdf-autotable`, `docx`, `file-saver` (all client-side, no server work needed for generation).
- Hebrew/RTL: embed a Hebrew TTF (e.g. Heebo) as base64 into the PDF generator so glyphs render correctly.
- New tables (only if you approve timeline + admin notes):
  - `order_status_history(order_id, from_status, to_status, changed_by, changed_at, note)`
  - add `admin_notes text` column to `orders`.
- New server fns in `admin.functions.ts`: `getOrderDetail(id)` returning order + history + team budget context.

**Which of these should I plan in detail and build?**
