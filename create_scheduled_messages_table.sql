-- Create scheduled_messages table from scratch
CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('sms','email')),
  subject TEXT,
  message TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  error_message TEXT,
  user_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

-- Create policies for user ownership
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

-- Create helpful indexes
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_user_id ON public.scheduled_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_customer_id ON public.scheduled_messages(customer_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_scheduled_for ON public.scheduled_messages(scheduled_for);
