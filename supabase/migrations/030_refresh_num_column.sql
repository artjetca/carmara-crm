-- Refresh num column and schema cache
-- Drop and recreate num column to ensure it's properly recognized
ALTER TABLE public.customers DROP COLUMN IF EXISTS num;
ALTER TABLE public.customers ADD COLUMN num TEXT;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
