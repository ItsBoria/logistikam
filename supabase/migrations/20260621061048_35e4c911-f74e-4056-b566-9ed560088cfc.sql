
-- Remove privilege escalation: drop self-insert/self-update on team_members.
-- Memberships are managed by admins only.
DROP POLICY IF EXISTS "users set own membership" ON public.team_members;
DROP POLICY IF EXISTS "users update own membership" ON public.team_members;

-- Lock down SECURITY DEFINER functions: revoke execute from anon/public.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.team_month_spent(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_approver(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_month_spent(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_approver(uuid) TO authenticated;
