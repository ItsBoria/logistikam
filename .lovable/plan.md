# Three improvements

## 1. Fix the invoice PDF export

**Error:** `Attempting to parse an unsupported color function "lab"`.
**Cause:** `html2canvas` can't parse the modern `oklch()` / `lab()` colors that Tailwind v4 and the shadcn theme emit. As soon as we snapshot a DOM node that inherits any themed color, it throws.

**Fix:** stop using `html2canvas` for the invoice. Generate the PDF directly with `jsPDF` + `jspdf-autotable`, and embed a Hebrew TTF (Heebo or Rubik) so RTL text renders correctly.

- Add dep: `jspdf-autotable`.
- Bundle a Heebo regular + bold `.ttf` as base64 under `src/assets/fonts/` and register it via `pdf.addFileToVFS` / `pdf.addFont`.
- Rewrite `downloadOrderInvoicePDF` in `src/lib/invoice.ts` to draw the header, meta block, items table (autotable), totals, notes — all with `pdf.setFont("Heebo")` and `align: "right"` for RTL. No DOM, no html2canvas.
- Remove `html2canvas` import (and dep if unused elsewhere).
- DOCX path is unchanged.

## 2. Compact-pill search bars

A single shared style applied to every search input in admin + shop:
- height 32px, `rounded-full`, `bg-muted/60`, no visible border, focus ring only
- search icon inside on the right (RTL), `text-xs` placeholder, max-width ~ 240px on desktop / full width on mobile

Implementation: add a small `<SearchInput />` component in `src/components/ui/search-input.tsx` and swap the existing search inputs to use it in:
- `src/routes/admin.orders.tsx`
- `src/routes/admin.products.tsx`
- `src/routes/admin.teams.tsx`
- `src/routes/admin.users.tsx`
- `src/routes/admin.stock.tsx`
- `src/routes/admin.replacements.tsx`
- `src/routes/shop.index.tsx`
- `src/routes/shop.orders.tsx`
- `src/routes/shop.replacements.tsx`

(Only the ones that actually have a search box today get touched.)

## 3. Weekly mission calendar (admin-only)

A weekly planner where an admin lays out missions per workday and signs off on the week, with PDF/DOCX export.

### Data model (migration)

```text
mission_weeks
  id, year int, week int (ISO), notes text
  created_by uuid, created_by_name text
  author_signed_at timestamptz, author_signature_name text
  approver_signed_at timestamptz, approver_signature_name text, approver_user_id uuid
  locked boolean (true once both signatures present)
  unique(year, week)

missions
  id, week_id fk → mission_weeks
  day_of_week int (0=Sun … 6=Sat, Israeli work week)
  position int (order inside the day)
  title text, details text, done boolean
```

- Both tables: `GRANT` to `authenticated` + `service_role`, RLS on, policies restrict all ops to `has_role(auth.uid(),'admin')`.
- Trigger `touch_updated_at`.

### Server functions (`src/lib/missions.functions.ts`)

All `.middleware([requireSupabaseAuth])` + admin-role check inside the handler.

- `getWeek({ year, week })` → ensures row exists, returns week + missions grouped by day
- `upsertMission({ week_id, day_of_week, id?, title, details })`
- `deleteMission({ id })`
- `toggleMissionDone({ id, done })`
- `signWeek({ week_id, role: 'author'|'approver', signature_name })` — sets the matching signature fields; when both filled, sets `locked=true`. Edits are blocked while locked.
- `listRecentWeeks({ limit })` — for a small picker.

### UI: `src/routes/admin.calendar.tsx`

- Header: ISO week picker (prev / next / "today"), shows `שבוע 24 · 8–14 ביוני 2026` and year.
- Grid: 6 day columns (Sun–Fri, Israeli work week — Sat hidden by default, toggle to show).
  - Each column = card with day name, date, "+ הוסף משימה" button.
  - Missions render as small rows with checkbox (done), title, details, edit / delete.
- Right sidebar: week notes + two signature blocks:
  - "נחתם על ידי האחראי" — typed name + Sign button → calls `signWeek({ role:'author' })`.
  - "אישור מנהל בכיר" — visible only to admins; typed name + Sign button → `signWeek({ role:'approver' })`.
  - When both signed → banner "השבוע נחתם ונעול" and all edit controls disabled.
- Export buttons (top right): "הורד PDF" / "הורד DOCX".

Add to admin bottom tab bar / sidebar nav.

### Weekly export

- **PDF**: same Heebo-based `jsPDF` setup from fix #1. Layout = title (`תכנית שבועית · שבוע N · YYYY`), team/author meta, a 6-column autotable (one column per day, missions stacked as bullet lines), notes box, two signature lines with names + dates.
- **DOCX**: native `docx` package, RTL paragraphs, single 6-column table mirroring the PDF, signature lines at the bottom.

Files: `src/lib/weekly-export.ts` exporting `downloadWeeklyPDF(week)` and `downloadWeeklyDOCX(week)`.

---

## Technical notes
- All new server fns require `attachSupabaseAuth` (already wired).
- Admin role check pattern uses the existing `has_role` RPC.
- ISO week math via `date-fns` `getISOWeek` / `setISOWeek` / `startOfISOWeek` (already a transitive dep; add explicitly if not).
- Heebo TTF: download once, commit as base64 module so the PDF lib has no network dependency at runtime.
- No changes to existing order/replacement flows beyond fix #1.
