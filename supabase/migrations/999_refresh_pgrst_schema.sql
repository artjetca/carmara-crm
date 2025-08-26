-- Auto-refresh PostgREST schema cache after deployments
-- This migration is idempotent and safe to re-run.

begin;
  -- Trigger PostgREST to reload its schema cache
  NOTIFY pgrst, 'reload schema';
commit;
