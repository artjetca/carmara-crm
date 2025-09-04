-- Force Schema Refresh Alternative Methods
-- Try multiple approaches to refresh PostgREST schema cache

-- Method 1: Multiple NOTIFY commands
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- Method 2: Check if postgrest role exists and grant permissions
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgrest') THEN
        GRANT ALL ON public.email_tracking TO postgrest;
        GRANT ALL ON public.appointment_responses TO postgrest;
        RAISE NOTICE 'Granted permissions to postgrest role';
    ELSE
        RAISE NOTICE 'postgrest role does not exist';
    END IF;
END $$;

-- Method 3: Verify tables are in the right schema and accessible
SELECT 
    schemaname,
    tablename,
    tableowner,
    hasindexes,
    hasrules,
    hastriggers
FROM pg_tables 
WHERE tablename IN ('email_tracking', 'appointment_responses')
ORDER BY tablename;

-- Method 4: Check if RLS is properly configured
SELECT 
    schemaname,
    tablename,
    rowsecurity,
    forcerowsecurity
FROM pg_tables 
WHERE tablename IN ('email_tracking', 'appointment_responses');

-- Method 5: List all policies on these tables
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename IN ('email_tracking', 'appointment_responses')
ORDER BY tablename, policyname;

-- Method 6: Try to force refresh with a database function
SELECT pg_notify('pgrst', 'reload schema');

-- Final verification: Simple table access test
SELECT 'email_tracking accessible' as test, count(*) as records FROM public.email_tracking;
SELECT 'appointment_responses accessible' as test, count(*) as records FROM public.appointment_responses;
