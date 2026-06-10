-- ============================================================
-- Phase 0: Data hardening before mobile revamp
-- Goal: move data that currently lives only in localStorage
-- (completedVisits, route completion state, geocoded coords)
-- into Supabase so nothing is lost when browser storage is
-- evicted (iOS Safari ITP purges localStorage after 7 days).
--
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- Project: mddyomibqbmnpexwgkug
-- Safe to run multiple times (IF NOT EXISTS everywhere).
-- ============================================================

-- 1) customers: persist geocoded coordinates server-side.
--    The app code (Customer interface, /api/customers PATCH,
--    visitsGeocodeUtils) already expects these columns.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS coordinates TEXT;

-- 2) visits: support completed-visit records (currently only in
--    localStorage 'completedVisits').
ALTER TABLE visits ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS route_id TEXT;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS route_name TEXT;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS customer_company TEXT;
-- legacy_id keeps the old localStorage id so re-running the
-- migration/upload never creates duplicates (upsert key).
ALTER TABLE visits ADD COLUMN IF NOT EXISTS legacy_id TEXT;
DO $$ BEGIN
  ALTER TABLE visits ADD CONSTRAINT visits_legacy_id_key UNIQUE (legacy_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS visits_route_id_idx ON visits(route_id);

-- Data-preservation: deleting a customer must NOT wipe visit
-- history (old FK was ON DELETE CASCADE). Keep the visit row,
-- null out the reference; customer_name stays as a snapshot.
ALTER TABLE visits ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE visits DROP CONSTRAINT IF EXISTS visits_customer_id_fkey;
ALTER TABLE visits ADD CONSTRAINT visits_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

-- 3) saved_routes: route completion state (currently only in
--    localStorage, which is why "Completar ruta" doesn't sync
--    across devices).
ALTER TABLE saved_routes ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT FALSE;
ALTER TABLE saved_routes ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE saved_routes ADD COLUMN IF NOT EXISTS completed_visits JSONB DEFAULT '[]'::jsonb;

-- Tell PostgREST to pick up the new columns immediately.
NOTIFY pgrst, 'reload schema';
