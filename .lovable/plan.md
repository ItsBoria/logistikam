# Admin bottom tab bar

Add a bottom tab bar to the admin/staff panel (the shop already has one). Keep the existing top navigation in `AdminShell` as-is; the bottom bar is additional.

## Scope

- New component: `src/components/admin-bottom-tab-bar.tsx`
  - Mirrors the visual style of `BottomTabBar` (fixed bottom, safe-area inset, sticky, RTL-friendly).
  - Renders a different set of tabs for admin vs. staff (4 tabs each, to stay readable on mobile):
    - Admin: סקירה (`/admin`), הזמנות (`/admin/orders`), מוצרים (`/admin/products`), התראות (`/admin/notifications`).
    - Staff: סקירה (`/admin`), הזמנות (`/admin/orders`), מלאי (`/admin/stock`), התראות (`/admin/notifications`).
  - The remaining admin sections (החלפות, מלאי החלפות, צוותים, מנהלים) stay reachable via the top nav.
  - Active-state styling via `useRouterState` + `Link` `to`/`params`, matching the existing pattern in `AdminShell`.

- `src/components/admin-shell.tsx`
  - Keep top header/nav unchanged (both desktop top bar and mobile horizontal scroll bar continue to work).
  - Render `<AdminBottomTabBar role={roles.isAdmin ? "admin" : "staff"} />` at the end of the shell.
  - Add bottom padding to `<main>` (e.g. `pb-20`) so content isn't covered by the fixed bar.

## Out of scope

- No removal/redesign of the current top nav.
- No changes to existing admin routes, permissions, or notifications.
- No changes to the shop bottom bar.

## Technical notes

- Reuse Tailwind tokens already used by `BottomTabBar` (bg-card/border-t/safe-area inset). No new design tokens.
- Tabs use typed `<Link to="/admin/...">` — all referenced routes already exist in `src/routes/`.
- Visible to both admin and staff; the tab set switches based on the `useAdminRoles()` result already read in `AdminShell`.
