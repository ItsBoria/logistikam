## Goal
Make it possible to find any registered user (including new Google sign-ups) from `/admin/users` and assign them an `admin` / `staff` / customer role — without needing DB access.

## Changes

### 1. Backend — `src/lib/admin.functions.ts`
Add `searchRegisteredUsers` server function:
- `requireSupabaseAuth` + `has_role(admin)` check.
- Loads `supabaseAdmin` inside the handler, calls `auth.admin.listUsers()`.
- Optional `query` string filters by email / display name (case-insensitive).
- Joins each user with `profiles` (display name) and `user_roles` (current role).
- Returns `{ id, email, displayName, provider, currentRole }[]` (capped, e.g. 50 results).

`updateAdminUserRole` already handles the "no existing role → insert" case, so it stays as-is and gets reused for newly-found users.

### 2. Frontend — `src/routes/admin.users.tsx`
Add a tab layout with two views:

**Tab 1 — משתמשי מערכת** (current behaviour, unchanged)
The existing list of users who already have `admin` or `staff` role.

**Tab 2 — כל המשתמשים** (new)
- Search input (email or name), debounced.
- Results list: avatar/initials, display name, email, provider badge (Google / אימייל), current role badge (מנהל / צוות / לקוח).
- Role dropdown on each row → calls `updateAdminUserRole` → refetches both tabs.
- Empty state + loading state.

RTL + existing design tokens, no new colors.

## Out of scope
- No schema changes.
- No changes to membership / teams logic.
- No bulk actions.

## How you'll use it
Sign in as `yuvalyu717@gmail.com` → **מנהלים** → **כל המשתמשים** → search `davidpanasik.dp@gmail.com` → set role to **מנהל**.
