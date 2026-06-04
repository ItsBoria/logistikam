CREATE TABLE public.team_budget_alerts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  threshold int not null,
  month date not null,
  created_at timestamptz not null default now(),
  unique (team_id, threshold, month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_budget_alerts TO authenticated;
GRANT ALL ON public.team_budget_alerts TO service_role;
ALTER TABLE public.team_budget_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage team_budget_alerts" ON public.team_budget_alerts FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));