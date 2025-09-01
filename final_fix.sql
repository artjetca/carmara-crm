-- Drop and recreate the table completely
DROP TABLE IF EXISTS public.scheduled_messages CASCADE;

-- Create the complete table with all required columns
CREATE TABLE public.scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID,
  type TEXT NOT NULL DEFAULT 'sms' CHECK (type IN ('sms','email')),
  subject TEXT,
  message TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  error_message TEXT,
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

-- Create policy that allows authenticated users
CREATE POLICY "allow_authenticated_users"
  ON public.scheduled_messages
  FOR ALL
  USING (auth.uid() IS NOT NULL);

-- Create indexes
CREATE INDEX idx_scheduled_messages_user_id ON public.scheduled_messages(user_id);
CREATE INDEX idx_scheduled_messages_customer_id ON public.scheduled_messages(customer_id);
CREATE INDEX idx_scheduled_messages_scheduled_for ON public.scheduled_messages(scheduled_for);
