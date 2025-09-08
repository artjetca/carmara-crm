-- Fix scheduled_messages foreign key constraint issues
-- Problem: Frontend expects 'scheduled_messages_created_by_fkey' but constraint may point to wrong table

BEGIN;

-- First, check current table structure and constraints
\d public.scheduled_messages;

-- Drop all existing foreign key constraints on scheduled_messages
DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    FOR constraint_record IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.scheduled_messages'::regclass 
        AND contype = 'f'
    LOOP
        EXECUTE format('ALTER TABLE public.scheduled_messages DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
    END LOOP;
END $$;

-- Ensure user_id column exists and has correct type
ALTER TABLE public.scheduled_messages 
  ALTER COLUMN user_id TYPE UUID USING user_id::UUID;

-- Create the correct foreign key constraint pointing to user_profiles table
-- Note: Frontend expects this specific constraint name
ALTER TABLE public.scheduled_messages
  ADD CONSTRAINT scheduled_messages_created_by_fkey
  FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE SET NULL;

-- Also ensure customer_id foreign key exists
ALTER TABLE public.scheduled_messages
  ADD CONSTRAINT scheduled_messages_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;

-- Create helpful indexes
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_user_id ON public.scheduled_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_customer_id ON public.scheduled_messages(customer_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_scheduled_for ON public.scheduled_messages(scheduled_for);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verify the fix
SELECT 
  'scheduled_messages constraints fixed' AS status,
  conname, 
  conrelid::regclass AS table_name,
  confrelid::regclass AS references_table,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.scheduled_messages'::regclass AND contype = 'f'
ORDER BY conname;
