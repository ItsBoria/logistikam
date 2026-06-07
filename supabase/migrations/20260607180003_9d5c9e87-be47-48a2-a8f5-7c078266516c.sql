
-- Admin push subscriptions (per admin user device)
CREATE TABLE public.admin_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_push_subscriptions TO authenticated;
GRANT ALL ON public.admin_push_subscriptions TO service_role;

ALTER TABLE public.admin_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own admin push subs"
  ON public.admin_push_subscriptions
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX admin_push_subscriptions_user_id_idx ON public.admin_push_subscriptions(user_id);

-- Per-admin notification preferences
CREATE TABLE public.admin_notification_prefs (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_type),
  CONSTRAINT admin_notification_prefs_event_type_check
    CHECK (event_type IN ('order_created','order_awaiting_approval','low_stock','replacement_request'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_notification_prefs TO authenticated;
GRANT ALL ON public.admin_notification_prefs TO service_role;

ALTER TABLE public.admin_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own notification prefs"
  ON public.admin_notification_prefs
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "admins read all notification prefs"
  ON public.admin_notification_prefs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Backfill: default preferences ON for existing admins
INSERT INTO public.admin_notification_prefs (user_id, event_type, enabled)
SELECT ur.user_id, evt.event_type, true
FROM public.user_roles ur
CROSS JOIN (VALUES
  ('order_created'),
  ('order_awaiting_approval'),
  ('low_stock'),
  ('replacement_request')
) AS evt(event_type)
WHERE ur.role = 'admin'
ON CONFLICT (user_id, event_type) DO NOTHING;
