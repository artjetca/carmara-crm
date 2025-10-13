-- Drop customer_type column and constraint from customers table
-- This reverts the changes made in 038_add_customer_type_column.sql

-- Drop the check constraint first
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customers_customer_type_check'
  ) THEN
    ALTER TABLE public.customers
      DROP CONSTRAINT customers_customer_type_check;
  END IF;
END $$;

-- Drop the customer_type column
ALTER TABLE public.customers
  DROP COLUMN IF EXISTS customer_type;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
