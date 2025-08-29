-- Unify customer number to canonical 'num' and drop legacy aliases
-- This migration backfills `num` from `customer_number` and `numero`,
-- then drops the legacy columns and reloads PostgREST schema cache.

BEGIN;

-- Ensure canonical column exists
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS num TEXT;

-- Backfill: prefer existing num, else customer_number, else numero
UPDATE public.customers
SET num = COALESCE(NULLIF(num, ''), NULLIF(customer_number, ''), NULLIF(numero, ''));

-- Drop legacy columns if present
ALTER TABLE public.customers DROP COLUMN IF EXISTS customer_number;
ALTER TABLE public.customers DROP COLUMN IF EXISTS numero;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
