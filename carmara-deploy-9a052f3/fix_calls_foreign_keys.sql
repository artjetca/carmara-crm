-- Fix foreign key names in calls table
-- The error shows wrong foreign key constraint names

-- First, let's check the actual foreign key names
SELECT 
    tc.constraint_name, 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_name='calls';

-- Drop and recreate the calls table with correct foreign key names
DROP TABLE IF EXISTS calls CASCADE;

CREATE TABLE calls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  from_user UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('incoming', 'outgoing')),
  duration INTEGER DEFAULT 0,
  notes TEXT,
  status VARCHAR(20) DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own calls" ON calls
  FOR SELECT USING (auth.uid() = from_user OR auth.uid() = to_user);

CREATE POLICY "Users can insert their own calls" ON calls
  FOR INSERT WITH CHECK (auth.uid() = from_user OR auth.uid() = to_user);

CREATE POLICY "Users can update their own calls" ON calls
  FOR UPDATE USING (auth.uid() = from_user OR auth.uid() = to_user);

CREATE POLICY "Users can delete their own calls" ON calls
  FOR DELETE USING (auth.uid() = from_user OR auth.uid() = to_user);

-- Create indexes
CREATE INDEX calls_from_user_idx ON calls(from_user);
CREATE INDEX calls_to_user_idx ON calls(to_user);
CREATE INDEX calls_created_at_idx ON calls(created_at DESC);

-- Add trigger
CREATE TRIGGER update_calls_updated_at 
    BEFORE UPDATE ON calls 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT ALL ON calls TO authenticated;
GRANT ALL ON calls TO service_role;

-- Check the actual foreign key constraint names after creation
SELECT 
    tc.constraint_name, 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_name='calls';

SELECT 'Calls table recreated with correct foreign keys' as status;
