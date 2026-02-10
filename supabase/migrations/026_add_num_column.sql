-- Add num column to customers table
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS num TEXT;

-- Add company column if it doesn't exist (from previous migration)
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS company TEXT;

-- Add contrato column if it doesn't exist
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS contrato TEXT;
