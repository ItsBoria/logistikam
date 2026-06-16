## Goal
One unified login screen. Users sign in with Google or email/password, pick their team once, and land in the shop. Admins go straight to the admin dashboard with no team/PIN step, and can switch into the shop as a test user for any team. The old team-PIN flow is removed.

## Changes

### 1. Database
- New `team_members` table linking a user to one team (`user_id` unique, `team_id` FK). RLS: a user can read/insert their own row; admins manage all rows.
- New `profiles` table (id = auth user id, display_name, email) auto-created on signup via trigger on `auth.users`.
- Keep `teams.pin` column for now (legacy, unused by login) so existing data isn't lost. We can drop it later.
- RLS update on `orders` / `order_items` / `replacement_requests`: allow a user to read/create rows where `team_id` matches their `team_members.team_id`, in addition to existing admin policies.

### 2. Auth
- Enable Google sign-in via Lovable Cloud managed OAuth (`lovable.auth.signInWithOAuth("google", ...)`).
- Keep email/password sign-up + sign-in.
- Remove the team-PIN tab and the synthetic `@admins.local` username flow.

### 3. New unified login page (`/` or `/auth`)
One card with:
- "Continue with Google" button
- Email + password form with a "Sign in / Sign up" toggle

After successful sign-in, role-based routing:
- `admin` → `/admin`
- everyone else with a `team_members` row → `/shop`
- everyone else without one → `/select-team` (pick from active teams; saves to `team_members`; then `/shop`)

### 4. Admin "shop as test user"
- In the admin shell, add a "View shop as…" team selector. Selecting a team stores the chosen `team_id` in a small client store (`adminActingTeamId`).
- The shop reads `team_id` from: admin override → user's own `team_members.team_id`.
- Banner in the shop when admin is acting as a team, with a "Stop testing" button that clears the override and returns to `/admin`.

### 5. Cleanup
- Remove `team-session.ts`, `verifyTeamPin`, the PIN tab, and the `bootstrapAdminUsername` / `resolveAdminEmail` server fns (admin is now just a normal account that happens to have the `admin` role assigned in `user_roles`).
- Provide a one-time SQL note in the migration description for how to grant the first admin role to your account (after you sign in once with Google, run an insert into `user_roles`). We'll surface this in the migration approval step.

## Files touched (high level)
- New migration: `team_members`, `profiles`, signup trigger, shop RLS policies.
- `src/routes/index.tsx` → rewrite into the unified login.
- New `src/routes/select-team.tsx`.
- `src/routes/_authenticated/route.tsx` (integration-managed) stays as-is.
- `src/components/admin-shell.tsx` → add "View shop as team" selector + acting-team store.
- `src/routes/shop.*` → read team from acting override or `team_members`; remove `getTeamSession` usage.
- Delete `src/lib/team-session.ts`, `src/routes/admin.login.tsx` (already a redirect), PIN-related server fns.

## Out of scope
- Multi-team membership (one user = one team for now; admins switch via the override).
- Email confirmation customization.
- Dropping the legacy `teams.pin` column (kept until we confirm nothing reads it).
