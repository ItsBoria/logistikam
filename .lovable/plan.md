## Goal
Redesign the search/filter toolbar in `src/routes/admin.orders.tsx` so it's cleaner, RTL-correct, collapses on scroll, and behaves well on mobile — without changing the underlying filter logic or query.

## Changes (single file: `src/routes/admin.orders.tsx`, plus one small helper)

### 1. New `OrdersToolbar` component (in-file)
A single Card-based toolbar that owns the visual layout. Props: all current filter state + setters + `resultCount`, `loading`, `onReset`, `onExport`.

Layout (desktop):
- Row 1: preset pills (unchanged) + active-filter count badge on the right.
- Row 2: grid with search (2 cols), team Select, status Select, date-from, date-to, sort Select (new — by date desc/asc, total desc/asc).
- Row 3: active-filter chips (each removable with ×) + "נקה הכל" button + Export button.

Visuals: match existing admin cards (`Card`, `bg-card/95 backdrop-blur`, semantic tokens only). Even spacing via `gap-3`, no large empty areas.

### 2. Collapse-on-scroll behavior
Reuse `useHideOnScroll` pattern (already in `src/hooks/use-scroll-direction.ts`) to drive a `collapsed` boolean. Add a manual `expanded` override that the user can toggle.

- When `collapsed && !expanded`: render a slim sticky bar — search icon + inline `SearchInput` (compact), "סינונים: N" badge, "הרחב" button. Height ~48px.
- When expanded: full toolbar.
- Transition: `transition-[max-height,opacity] duration-200 ease-out`, respecting `prefers-reduced-motion` (skip transition).
- Sticky container keeps a fixed min-height during the swap so the orders list doesn't jump.
- Collapsed bar stays inside the normal sticky toolbar slot (`sticky top-2`), not a floating button.

### 3. Search UX
- Add 250ms debounce: local `searchInput` state + `useEffect` setTimeout → `setSearch`. Query key still uses debounced `search`.
- Loading indicator: small spinner inside `SearchInput` or next to result count when `isLoading || isFetching`.
- Empty state already exists; upgrade it to include a "נקה סינונים" button when any filter is active.
- Scroll position: filters are already persisted via `localStorage`; add scroll restore by saving `window.scrollY` to `sessionStorage` on detail open and restoring on close (detail is a Dialog already, so scroll is preserved naturally — verify and only add restore if needed).

### 4. Sort
Add `sort` state (`"date_desc" | "date_asc" | "total_desc" | "total_asc"`), default `date_desc`. Apply client-side via `useMemo` over `orders` (server `listOrders` already returns full list). Include `sort` in `FILTER_STORAGE_KEY` payload.

### 5. Active filters
Compute `activeFilters` array from state (team name, status label, date range, search text, non-default sort). Render as chips with × that clears just that filter. Badge count = `activeFilters.length`.

### 6. Mobile
- Below `sm`: show only the compact search bar + a "סינונים (N)" button that opens an existing `Sheet` (`SheetContent side="right"` — correct for RTL since Sheet auto-mirrors with `dir`).
- Sheet contains: presets, team, status, date range, sort, reset.
- Ensure no horizontal overflow: `min-w-0` on flex children, `overflow-x-hidden` on toolbar container.
- Touch targets ≥ 44px on filter button and chips.

### 7. RTL/A11y
- Use logical Tailwind utilities already in use (`ml-2`, etc. — keep existing convention since the app is RTL-first).
- Add `aria-label` to search input, filter button, expand/collapse button, each chip's × button, sort select.
- Add `aria-live="polite"` region with "נמצאו N הזמנות" so screen readers hear updates.
- Honor `prefers-reduced-motion: reduce` → disable transitions.
- Keyboard: expand/collapse button is a normal `<Button>`; chips' × are buttons; Sheet has built-in focus trap.

### 8. What stays unchanged
- `listOrders` server function, query keys, statuses, edit/delete/cleanup dialogs, accordion list, invoice export, presets logic.
- Storage key bumped to `admin-orders-filters-v2` to include `sort` cleanly (old key ignored gracefully).

## Files touched
- `src/routes/admin.orders.tsx` — toolbar redesign, collapse, debounce, sort, chips, mobile sheet.
- No new dependencies. No backend changes.

## Out of scope
- Order list rendering, edit/delete flows, business logic, server function signatures.
