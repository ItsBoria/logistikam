
-- mission_weeks
CREATE TABLE public.mission_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year int NOT NULL,
  week int NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text,
  author_signed_at timestamptz,
  author_signature_name text,
  approver_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approver_signed_at timestamptz,
  approver_signature_name text,
  locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(year, week)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_weeks TO authenticated;
GRANT ALL ON public.mission_weeks TO service_role;

ALTER TABLE public.mission_weeks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage mission_weeks"
  ON public.mission_weeks FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER mission_weeks_touch_updated_at
  BEFORE UPDATE ON public.mission_weeks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- missions
CREATE TABLE public.missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id uuid NOT NULL REFERENCES public.mission_weeks(id) ON DELETE CASCADE,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  position int NOT NULL DEFAULT 0,
  title text NOT NULL,
  details text,
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.missions TO authenticated;
GRANT ALL ON public.missions TO service_role;

ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage missions"
  ON public.missions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX missions_week_id_idx ON public.missions(week_id);

CREATE TRIGGER missions_touch_updated_at
  BEFORE UPDATE ON public.missions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
