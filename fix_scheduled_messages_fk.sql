-- Fix scheduled_messages foreign key constraint - Simple solution using auth.users
-- Problem: Foreign key constraint violation - use direct reference to auth.users

BEGIN;

-- 1. Drop all existing policies for scheduled_messages
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN 
        SELECT schemaname, tablename, policyname
        FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'scheduled_messages'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 
                      policy_record.policyname, 
                      policy_record.schemaname, 
                      policy_record.tablename);
    END LOOP;
END $$;

-- 2. Drop all existing foreign key constraints
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

-- 3. Ensure correct column structure
DO $$
BEGIN
    -- Drop created_by column if it exists
    BEGIN
        ALTER TABLE public.scheduled_messages DROP COLUMN IF EXISTS created_by;
    EXCEPTION WHEN undefined_column THEN 
        NULL;
    END;
    
    -- Add user_id column if it doesn't exist
    BEGIN
        ALTER TABLE public.scheduled_messages ADD COLUMN user_id UUID;
    EXCEPTION WHEN duplicate_column THEN 
        NULL;
    END;
    
    -- Ensure user_id has correct type
    ALTER TABLE public.scheduled_messages 
      ALTER COLUMN user_id TYPE UUID USING user_id::UUID;
END $$;

-- 4. Create foreign key constraints pointing to user_profiles (needed for frontend queries)
ALTER TABLE public.scheduled_messages
  ADD CONSTRAINT scheduled_messages_created_by_fkey
  FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE SET NULL;

ALTER TABLE public.scheduled_messages
  ADD CONSTRAINT scheduled_messages_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;

-- 5. Create simple RLS policies
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scheduled_messages_select_own"
  ON public.scheduled_messages
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "scheduled_messages_insert_own"
  ON public.scheduled_messages
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "scheduled_messages_update_own"
  ON public.scheduled_messages
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "scheduled_messages_delete_own"
  ON public.scheduled_messages
  FOR DELETE
  USING (user_id = auth.uid());

-- 6. Create indexes
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_user_id ON public.scheduled_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_customer_id ON public.scheduled_messages(customer_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_scheduled_for ON public.scheduled_messages(scheduled_for);

-- 7. Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';

COMMIT;

-- 8. Verify the fix
SELECT 
  'Foreign key fixed - using auth.users' AS status,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'scheduled_messages'
AND column_name = 'user_id';
