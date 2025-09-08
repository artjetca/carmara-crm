-- Align scheduled_messages -> profiles relationship with frontend hint
-- Frontend uses: profiles!scheduled_messages_created_by_fkey
-- We will bind that FK name to column user_id (no need to rename column)

BEGIN;

-- Drop existing FK with that name if any
ALTER TABLE public.scheduled_messages
  DROP CONSTRAINT IF EXISTS scheduled_messages_created_by_fkey;

-- Create FK on user_id with the expected constraint name
ALTER TABLE public.scheduled_messages
  ADD CONSTRAINT scheduled_messages_created_by_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Helpful index
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_user_id ON public.scheduled_messages(user_id);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verify
SELECT 'scheduled_messages FK aligned' AS status,
       conname, confrelid::regclass AS references_table
FROM pg_constraint
WHERE conrelid = 'public.scheduled_messages'::regclass AND contype = 'f';
