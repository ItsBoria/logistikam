
-- Per-admin calendars + approver flag
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_approver boolean NOT NULL DEFAULT false;

ALTER TABLE public.mission_weeks ADD COLUMN IF NOT EXISTS owner_user_id uuid;
UPDATE public.mission_weeks SET owner_user_id = created_by WHERE owner_user_id IS NULL;
ALTER TABLE public.mission_weeks ALTER COLUMN owner_user_id SET NOT NULL;

-- Replace unique constraint to (year, week, owner)
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint WHERE conrelid='public.mission_weeks'::regclass AND contype='u';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE public.mission_weeks DROP CONSTRAINT %I', c); END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS mission_weeks_owner_week_uniq
  ON public.mission_weeks(owner_user_id, year, week);

-- Helper: is approver
CREATE OR REPLACE FUNCTION public.is_approver(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE((SELECT is_approver FROM public.profiles WHERE id = _user_id), false)
$$;

-- Refresh RLS: admins can read all weeks; only owner or approver can modify
DROP POLICY IF EXISTS "mission_weeks_admin_all" ON public.mission_weeks;
DROP POLICY IF EXISTS "mission_weeks_select" ON public.mission_weeks;
DROP POLICY IF EXISTS "mission_weeks_modify" ON public.mission_weeks;

CREATE POLICY "mission_weeks_select" ON public.mission_weeks FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "mission_weeks_insert" ON public.mission_weeks FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') AND owner_user_id = auth.uid());

CREATE POLICY "mission_weeks_update" ON public.mission_weeks FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND (owner_user_id = auth.uid() OR public.is_approver(auth.uid())))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "mission_weeks_delete" ON public.mission_weeks FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND owner_user_id = auth.uid());

DROP POLICY IF EXISTS "missions_admin_all" ON public.missions;
DROP POLICY IF EXISTS "missions_select" ON public.missions;
DROP POLICY IF EXISTS "missions_modify" ON public.missions;

CREATE POLICY "missions_select" ON public.missions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "missions_write" ON public.missions FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  AND EXISTS (SELECT 1 FROM public.mission_weeks w WHERE w.id = missions.week_id AND w.owner_user_id = auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  AND EXISTS (SELECT 1 FROM public.mission_weeks w WHERE w.id = missions.week_id AND w.owner_user_id = auth.uid())
);
