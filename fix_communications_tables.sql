-- Fix Communications page missing tables
-- Create calls table for Communication logging
CREATE TABLE IF NOT EXISTS calls (
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

-- Create profiles table if it doesn't exist
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255),
  full_name VARCHAR(255),
  email VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on calls table
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

-- Create policies for calls table
DROP POLICY IF EXISTS "Users can view their own calls" ON calls;
DROP POLICY IF EXISTS "Users can insert their own calls" ON calls;
DROP POLICY IF EXISTS "Users can update their own calls" ON calls;
DROP POLICY IF EXISTS "Users can delete their own calls" ON calls;

CREATE POLICY "Users can view their own calls" ON calls
  FOR SELECT USING (auth.uid() = from_user OR auth.uid() = to_user);

CREATE POLICY "Users can insert their own calls" ON calls
  FOR INSERT WITH CHECK (auth.uid() = from_user OR auth.uid() = to_user);

CREATE POLICY "Users can update their own calls" ON calls
  FOR UPDATE USING (auth.uid() = from_user OR auth.uid() = to_user);

CREATE POLICY "Users can delete their own calls" ON calls
  FOR DELETE USING (auth.uid() = from_user OR auth.uid() = to_user);

-- Enable RLS on profiles table
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create policies for profiles table
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

CREATE POLICY "Users can view all profiles" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS calls_from_user_idx ON calls(from_user);
CREATE INDEX IF NOT EXISTS calls_to_user_idx ON calls(to_user);
CREATE INDEX IF NOT EXISTS calls_created_at_idx ON calls(created_at DESC);

-- Add updated_at trigger for calls
DROP TRIGGER IF EXISTS update_calls_updated_at ON calls;
CREATE TRIGGER update_calls_updated_at 
    BEFORE UPDATE ON calls 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add updated_at trigger for profiles
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at 
    BEFORE UPDATE ON profiles 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT ALL ON calls TO authenticated;
GRANT ALL ON calls TO service_role;
GRANT ALL ON profiles TO authenticated;
GRANT ALL ON profiles TO service_role;

-- Insert current user profile if it doesn't exist
INSERT INTO profiles (id, name, full_name, email)
SELECT 
    auth.uid(),
    'Usuario',
    'Usuario CRM',
    (SELECT email FROM auth.users WHERE id = auth.uid())
WHERE auth.uid() IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- Verify tables creation
SELECT 'Communication tables created successfully' as status;
