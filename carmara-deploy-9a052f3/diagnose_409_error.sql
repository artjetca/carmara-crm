-- Diagnose 409 error in scheduled_messages table
-- Run this in Supabase SQL Editor to identify the exact constraint issue

-- 1. Check current table structure
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'scheduled_messages'
ORDER BY ordinal_position;

-- 2. Check all foreign key constraints
SELECT 
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_name = 'scheduled_messages';

-- 3. Check RLS policies
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
WHERE schemaname = 'public' 
  AND tablename = 'scheduled_messages';

-- 4. Check if user_profiles table exists and has correct structure
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'user_profiles'
ORDER BY ordinal_position;

-- 5. Check current user authentication status
SELECT 
  'Current user ID: ' || COALESCE(auth.uid()::text, 'NOT AUTHENTICATED') AS auth_status;

-- 6. Test if we can insert a simple record (this will show the exact error)
-- Note: This is just for testing, will be rolled back
BEGIN;
INSERT INTO public.scheduled_messages (
  user_id,
  customer_id, 
  message,
  scheduled_for,
  status
) VALUES (
  auth.uid(),
  (SELECT id FROM public.customers LIMIT 1),
  'Test message',
  NOW() + INTERVAL '1 hour',
  'pending'
);
ROLLBACK;
