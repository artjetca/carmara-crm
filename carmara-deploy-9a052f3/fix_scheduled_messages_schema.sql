-- Fix scheduled_messages table schema
-- Add missing columns that should exist based on migration 036

-- Add missing columns
ALTER TABLE public.scheduled_messages 
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'sms' CHECK (type IN ('sms','email')),
ADD COLUMN IF NOT EXISTS subject TEXT,
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id);

-- Update existing rows to have valid type
UPDATE public.scheduled_messages SET type = 'sms' WHERE type IS NULL;

-- Make type NOT NULL after setting defaults
ALTER TABLE public.scheduled_messages ALTER COLUMN type SET NOT NULL;

-- Ensure RLS is enabled
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "scheduled_messages_select_own_or_admin" ON public.scheduled_messages;
DROP POLICY IF EXISTS "scheduled_messages_insert_own" ON public.scheduled_messages;
DROP POLICY IF EXISTS "scheduled_messages_update_own_or_admin" ON public.scheduled_messages;
DROP POLICY IF EXISTS "scheduled_messages_delete_own_or_admin" ON public.scheduled_messages;
DROP POLICY IF EXISTS "Solo administradores pueden gestionar mensajes" ON public.scheduled_messages;

-- Create policies for user ownership (using profiles table since user_profiles doesn't exist)
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
