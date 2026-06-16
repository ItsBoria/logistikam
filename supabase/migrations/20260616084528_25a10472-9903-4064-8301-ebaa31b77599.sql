ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS is_admin_only boolean NOT NULL DEFAULT false;

INSERT INTO public.teams (name, pin, monthly_limit, contact_phone, active, is_admin_only)
SELECT 'צוות בדיקה (אדמין)', 'TEST', 0, NULL, true, true
WHERE NOT EXISTS (SELECT 1 FROM public.teams WHERE name = 'צוות בדיקה (אדמין)');