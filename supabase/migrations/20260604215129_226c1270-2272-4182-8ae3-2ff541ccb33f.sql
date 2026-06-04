ALTER TABLE public.replacement_requests ALTER COLUMN status DROP DEFAULT;
ALTER TYPE public.replacement_status RENAME TO replacement_status_old;
CREATE TYPE public.replacement_status AS ENUM ('preparing','ready','done','cancelled');
ALTER TABLE public.replacement_requests
  ALTER COLUMN status TYPE public.replacement_status
  USING (
    CASE status::text
      WHEN 'awaiting_approval' THEN 'preparing'
      WHEN 'approved' THEN 'done'
      WHEN 'rejected' THEN 'cancelled'
      ELSE 'preparing'
    END
  )::public.replacement_status;
ALTER TABLE public.replacement_requests ALTER COLUMN status SET DEFAULT 'preparing'::public.replacement_status;
DROP TYPE public.replacement_status_old;