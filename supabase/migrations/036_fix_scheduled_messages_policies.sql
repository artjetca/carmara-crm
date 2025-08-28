-- Ensure scheduled_messages table exists and RLS allows authenticated users to create their own messages

-- 1) Create table if it doesn't exist (aligns with current app usage)
CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('sms','email')),
  subject TEXT,
  message TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  error_message TEXT,
  user_id UUID REFERENCES public.user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2) Enable RLS
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

-- 3) Clean up conflicting policies if they exist (admin-only policy from earlier scripts)
DO $$
BEGIN
  BEGIN
    DROP POLICY IF EXISTS "Solo administradores pueden gestionar mensajes" ON public.scheduled_messages;
  EXCEPTION WHEN undefined_object THEN NULL; END;

  BEGIN
    DROP POLICY IF EXISTS "Enable read access for all users" ON public.scheduled_messages;
  EXCEPTION WHEN undefined_object THEN NULL; END;

  BEGIN
    DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.scheduled_messages;
  EXCEPTION WHEN undefined_object THEN NULL; END;

  BEGIN
    DROP POLICY IF EXISTS "Enable update for users based on email" ON public.scheduled_messages;
  EXCEPTION WHEN undefined_object THEN NULL; END;
END $$;

-- 4) Policies allowing users to manage their own messages, admins can see all
CREATE POLICY "scheduled_messages_select_own_or_admin"
  ON public.scheduled_messages
  FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "scheduled_messages_insert_own"
  ON public.scheduled_messages
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "scheduled_messages_update_own_or_admin"
  ON public.scheduled_messages
  FOR UPDATE
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "scheduled_messages_delete_own_or_admin"
  ON public.scheduled_messages
  FOR DELETE
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- 5) Optional helpful indexes
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_user_id ON public.scheduled_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_customer_id ON public.scheduled_messages(customer_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_scheduled_for ON public.scheduled_messages(scheduled_for);
