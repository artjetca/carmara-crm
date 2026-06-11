-- ============================================================
-- Phase 0: Data hardening for mobile revamp
-- Goal: everything currently trapped in localStorage gets a
-- durable home in Supabase. Run once in SQL Editor.
-- ============================================================

-- 1) customers: persist geocoded coordinates
--    (code already PATCHes latitude/longitude/coordinates via
--    /api/customers but the columns never existed)
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS coordinates TEXT;

-- 2) visits: support completed-visit records migrated from
--    localStorage('completedVisits')
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS route_id TEXT;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS route_name TEXT;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS customer_company TEXT;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS legacy_id TEXT;

-- legacy_id: dedup key for localStorage-migrated visits
-- (UNIQUE allows multiple NULLs, so app-created rows are unaffected)
DO $$ BEGIN
  ALTER TABLE public.visits ADD CONSTRAINT visits_legacy_id_key UNIQUE (legacy_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS visits_route_id_idx ON public.visits(route_id);

-- Visit history must survive customer deletion (data-loss guard):
-- replace ON DELETE CASCADE with ON DELETE SET NULL
ALTER TABLE public.visits ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE public.visits DROP CONSTRAINT IF EXISTS visits_customer_id_fkey;
ALTER TABLE public.visits
  ADD CONSTRAINT visits_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;

-- 3) saved_routes: completion state (currently localStorage-only
--    because these columns were missing)
ALTER TABLE public.saved_routes ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT FALSE;
ALTER TABLE public.saved_routes ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.saved_routes ADD COLUMN IF NOT EXISTS completed_visits JSONB DEFAULT '[]'::jsonb;

-- 4) make PostgREST pick up the new columns immediately
NOTIFY pgrst, 'reload schema';
