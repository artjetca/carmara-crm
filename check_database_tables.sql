-- Check if saved_routes table exists
SELECT table_name, table_schema 
FROM information_schema.tables 
WHERE table_name = 'saved_routes';

-- Check all tables in public schema
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- If saved_routes exists, check its structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'saved_routes' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check RLS policies on saved_routes
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies 
WHERE tablename = 'saved_routes';
