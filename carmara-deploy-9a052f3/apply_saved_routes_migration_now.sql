-- Apply saved_routes table migration to fix cross-device synchronization
-- This will create the table needed for route syncing between devices

-- Create saved routes table for storing user route planning data
CREATE TABLE IF NOT EXISTS saved_routes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  route_date DATE,
  route_time TIME,
  customers JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_distance DECIMAL(10,2) DEFAULT 0,
  total_duration INTEGER DEFAULT 0,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE saved_routes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own routes" ON saved_routes;
DROP POLICY IF EXISTS "Users can insert their own routes" ON saved_routes;
DROP POLICY IF EXISTS "Users can update their own routes" ON saved_routes;
DROP POLICY IF EXISTS "Users can delete their own routes" ON saved_routes;

-- Create policies
CREATE POLICY "Users can view their own routes" ON saved_routes
  FOR SELECT USING (auth.uid() = created_by);

CREATE POLICY "Users can insert their own routes" ON saved_routes
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own routes" ON saved_routes
  FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own routes" ON saved_routes
  FOR DELETE USING (auth.uid() = created_by);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS saved_routes_created_by_idx ON saved_routes(created_by);
CREATE INDEX IF NOT EXISTS saved_routes_created_at_idx ON saved_routes(created_at DESC);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_saved_routes_updated_at ON saved_routes;
CREATE TRIGGER update_saved_routes_updated_at 
    BEFORE UPDATE ON saved_routes 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions to authenticated users
GRANT ALL ON saved_routes TO authenticated;
GRANT ALL ON saved_routes TO service_role;

-- Verify table creation
SELECT 'saved_routes table created successfully' as status;
