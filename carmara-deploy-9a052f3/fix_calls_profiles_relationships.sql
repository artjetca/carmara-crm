-- Align calls <-> profiles relationships with explicit FK names expected by PostgREST
-- This fixes: Could not find a relationship between 'calls' and 'profiles' (PGRST200)
-- Frontend expects: profiles!calls_from_user_fkey and profiles!calls_to_user_fkey

BEGIN;

-- 1) Drop existing FKs to auth.users if present
DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    WHERE tc.table_name = 'calls'
      AND tc.constraint_type = 'FOREIGN KEY'
  LOOP
    EXECUTE format('ALTER TABLE calls DROP CONSTRAINT IF EXISTS %I', fk.constraint_name);
  END LOOP;
END $$;

-- 2) Recreate FKs pointing to profiles(id) with explicit names
ALTER TABLE calls
  ADD CONSTRAINT calls_from_user_fkey FOREIGN KEY (from_user)
    REFERENCES profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT calls_to_user_fkey FOREIGN KEY (to_user)
    REFERENCES profiles(id) ON DELETE CASCADE;

-- 3) Ensure join performance
CREATE INDEX IF NOT EXISTS calls_from_user_idx ON calls(from_user);
CREATE INDEX IF NOT EXISTS calls_to_user_idx ON calls(to_user);

-- 4) Ask PostgREST to reload schema cache
-- Safe no-op if extension not listening
NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verification queries (run to inspect)
SELECT 'FK to profiles created' AS status,
       conname, confrelid::regclass AS references_table
FROM pg_constraint
WHERE conrelid = 'public.calls'::regclass AND contype = 'f';
