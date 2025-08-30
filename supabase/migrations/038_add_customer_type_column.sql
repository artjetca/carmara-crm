-- Add customer_type column to customers table
-- Values: 'formal' | 'potential' (NULL allowed)
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS customer_type TEXT;

-- Optional CHECK constraint to limit values (NULL allowed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customers_customer_type_check'
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_customer_type_check
      CHECK (
        customer_type IN ('formal', 'potential')
        OR customer_type IS NULL
      );
  END IF;
END $$;

-- Backfill from existing contrato values
-- If contrato contains 'SIN FACTURACIÓN' (case and accent insensitive), set 'potential', else 'formal'
UPDATE public.customers
SET customer_type = 'potential'
WHERE contrato IS NOT NULL
  AND lower(unaccent(contrato)) LIKE '%sin facturacion%';

UPDATE public.customers
SET customer_type = 'formal'
WHERE customer_type IS NULL;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
