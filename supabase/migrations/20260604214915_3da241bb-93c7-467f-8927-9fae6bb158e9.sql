ALTER TABLE public.replacement_requests
  ADD CONSTRAINT replacement_requests_team_id_fkey
  FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;