
-- Mission fields
ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS due_time time NULL,
  ADD COLUMN IF NOT EXISTS reminder_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS carried_from_id uuid NULL REFERENCES public.missions(id) ON DELETE SET NULL;

-- Per-day influencers notes
CREATE TABLE IF NOT EXISTS public.mission_day_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id uuid NOT NULL REFERENCES public.mission_weeks(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  influencers text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (week_id, day_of_week)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_day_notes TO authenticated;
GRANT ALL ON public.mission_day_notes TO service_role;

ALTER TABLE public.mission_day_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read day notes"
  ON public.mission_day_notes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "owner edits day notes"
  ON public.mission_day_notes FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') AND EXISTS (
      SELECT 1 FROM public.mission_weeks w
      WHERE w.id = mission_day_notes.week_id
        AND w.owner_user_id = auth.uid()
        AND w.locked = false
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') AND EXISTS (
      SELECT 1 FROM public.mission_weeks w
      WHERE w.id = mission_day_notes.week_id
        AND w.owner_user_id = auth.uid()
        AND w.locked = false
    )
  );

CREATE TRIGGER mission_day_notes_touch
  BEFORE UPDATE ON public.mission_day_notes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
