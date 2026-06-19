## Plan

### 1. Cart/Budget pill — show budget inline
Update `src/components/cart-budget-pill.tsx`: add a third text line (or a compact "₪X / ₪Y" format) inside the pill showing current spent + total budget limit alongside the existing cart total. Stays reactive via existing props.

### 2. Auto-hide top header on scroll
Create `src/hooks/use-scroll-direction.ts` returning a `hidden` boolean (hidden when scrolling down past ~40px, shown when scrolling up). Apply to the shop header in `src/routes/shop.index.tsx` (and admin header in `src/components/admin-shell.tsx`) via a `translate-y-[-100%]` + `transition-transform duration-300` class on the sticky header wrapper.

### 3. Persistent tab navigation with page transitions
TanStack Router remounts route components on navigation — true keep-alive is not natively supported. Approach:
- Add a `<PageTransition>` wrapper (framer-motion `AnimatePresence` + `motion.div` with fade/slide-x) inside `__root.tsx` around `<Outlet />`, keyed by pathname.
- For shop tabs (`/shop`, `/shop/orders`, `/shop/replacements`) keep data fresh via React Query cache (already in place) so re-mounts are instant with no network reload.
- Result: smooth slide animation, no full page reload, cached data → feels native.

### 4. Calendar PDF export — match the uploaded paper format
Rewrite `src/lib/weekly-export.ts` PDF generator to mirror the reference sheet:
- Landscape A4, RTL column order (Sunday on the right).
- Top: logo + title "תוכנית עבודה שבועית" + "שבוע N | חודש YYYY".
- Grid header row per day with date, then two sub-columns "תיכנון" / "ביצוע".
- Left-side category rows (RTL: rightmost cell): גורמים משפיעים, חופשות/קורסים, ספירות, אפסנאות, תחמושת (configurable categories — start with these defaults from the image).
- Bottom: two signature blocks — "חתימת מנהל אתר אחסון" and "חתימת מנהל עבודה" with שם מלא / מ.א / דרגה / חתימה / תאריך.
- Fix Hebrew direction: use `pdf.text(str, x, y, { align: "right", isInputRtl: true })` with the Heebo font already embedded. Replace any backwards rendering.

### 5. Missions — add date, time, status, reminders
Schema migration on `missions`:
- Add `due_date date` (already implied by day_of_week+week), `due_time time`, `reminder_at timestamptz`, keep existing `done bool`.
- Update `upsertMission` server fn + editor dialog in `admin.calendar.tsx` to accept time + reminder fields.
- UI: time chip on mission card, checkbox already exists, clear "סמן כבוצע / בוטל" button.
- Reminders: use existing web-push infra (`push.functions.ts`) — add a server-side scheduled check (pg_cron calling a public endpoint `/api/public/mission-reminders`) that sends push to the owner when `reminder_at <= now()` and not yet sent. Add `reminder_sent_at` column.

### 6. Carry unfinished missions to next week
Add server fn `carryUnfinishedToNextWeek({ week_id })`:
- Finds missions where `done=false` for that week.
- Creates/loads next week's `mission_weeks` row for same owner.
- Inserts copies with same title/details/time, `day_of_week` mapped (default Sunday), preserves original mission id reference via new `carried_from_id` column.
UI in `admin.calendar.tsx`: when viewing a past/current week with unfinished items, show a "העבר משימות לא הושלמו לשבוע הבא" button → confirm dialog → call fn → toast.

### 7. Daily "גורמים משפיעים" field per day
New table `mission_day_notes (week_id, day_of_week, influencers text, created_at, updated_at)` with unique (week_id, day_of_week). RLS mirrors `missions`.
- Server fns `getDayNotes(week_id)` (returns map) and `upsertDayNote({week_id, day_of_week, influencers})`.
- In calendar UI add a small textarea under each day header labeled "גורמים משפיעים" with debounced auto-save (disabled when locked / not owner).
- Include the influencers row in the PDF export per day.

### Technical details
- Files created: `src/hooks/use-scroll-direction.ts`, `src/components/page-transition.tsx`, new migration for `missions` (time/reminder/carried_from) + `mission_day_notes` table + GRANTs + RLS, optional `src/routes/api/public/mission-reminders.ts`.
- Files edited: `cart-budget-pill.tsx`, `shop.index.tsx`, `admin-shell.tsx`, `__root.tsx`, `weekly-export.ts`, `missions.functions.ts`, `admin.calendar.tsx`, `integrations/supabase/types.ts` (auto-regen).
- Hebrew RTL in jsPDF: pass `{ align: "right", isInputRtl: true }` to every `pdf.text` and reverse column iteration order so the visual layout reads right-to-left.
- Push reminders need pg_cron; if not desired, fall back to client-side `Notification` API while the app is open.
