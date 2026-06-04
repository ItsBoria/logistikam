
-- 1. Per-product low-stock threshold
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS low_stock_threshold integer;

-- 2. App settings (key/value)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage app_settings" ON public.app_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.app_settings (key, value)
VALUES ('default_low_stock_threshold', '5'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 3. Replacement products (admin-only, separate inventory)
CREATE TABLE public.replacement_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text,
  image_url text,
  active boolean NOT NULL DEFAULT true,
  takin_stock integer NOT NULL DEFAULT 0,
  balai_stock integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.replacement_products TO authenticated;
GRANT ALL ON public.replacement_products TO service_role;
ALTER TABLE public.replacement_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage replacement_products" ON public.replacement_products
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_replacement_products_updated
  BEFORE UPDATE ON public.replacement_products
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. Replacement requests
CREATE TYPE public.replacement_status AS ENUM ('awaiting_approval','approved','rejected');

CREATE TABLE public.replacement_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  status public.replacement_status NOT NULL DEFAULT 'awaiting_approval',
  ordered_by_name text,
  contact_phone text,
  notes text,
  decided_at timestamp with time zone,
  decided_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.replacement_requests TO authenticated;
GRANT ALL ON public.replacement_requests TO service_role;
ALTER TABLE public.replacement_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage replacement_requests" ON public.replacement_requests
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_replacement_requests_updated
  BEFORE UPDATE ON public.replacement_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. Replacement request items
CREATE TABLE public.replacement_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.replacement_requests(id) ON DELETE CASCADE,
  replacement_product_id uuid,
  name text NOT NULL,
  quantity integer NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.replacement_request_items TO authenticated;
GRANT ALL ON public.replacement_request_items TO service_role;
ALTER TABLE public.replacement_request_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage replacement_request_items" ON public.replacement_request_items
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
