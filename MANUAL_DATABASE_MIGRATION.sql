-- Manual Database Migration for customer_type column
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard/project/aotpcnwjjpkzxnhvmcvb/sql)

-- Step 1: Add the customer_type column
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS customer_type TEXT 
CHECK (customer_type IN ('formal', 'potential'));

-- Step 2: Update existing records based on contrato field
UPDATE customers 
SET customer_type = CASE 
  WHEN LOWER(TRIM(COALESCE(contrato, ''))) LIKE '%sin facturacion%' THEN 'potential'
  ELSE 'formal'
END
WHERE customer_type IS NULL;

-- Step 3: Verify the migration
SELECT 
  customer_type, 
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM customers), 2) as percentage
FROM customers 
GROUP BY customer_type
ORDER BY customer_type;

-- Step 4: Show sample records to verify
SELECT 
  id, 
  name, 
  contrato, 
  customer_type 
FROM customers 
LIMIT 10;
