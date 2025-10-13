-- Check pending visits causing the "1 Pendiente" issue
SELECT 
    id,
    status,
    scheduled_date,
    scheduled_at,
    customer_id,
    customer_name,
    created_at,
    updated_at
FROM visits 
WHERE status IN ('pending', 'programada')
ORDER BY created_at DESC;

-- Optional: Update pending visits to completed (uncomment to run)
-- UPDATE visits 
-- SET status = 'completed', updated_at = NOW()
-- WHERE status IN ('pending', 'programada');

-- Optional: Delete test/invalid pending visits (uncomment if needed)  
-- DELETE FROM visits 
-- WHERE status IN ('pending', 'programada') 
--   AND (customer_name IS NULL OR customer_name = 'Test Customer');
