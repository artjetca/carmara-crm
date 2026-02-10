-- Create visits table for storing scheduled customer visits
CREATE TABLE IF NOT EXISTS visits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  customer_name VARCHAR(255),
  scheduled_date DATE,
  scheduled_at TIMESTAMPTZ,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'programada', 'completed', 'completada', 'cancelled', 'cancelada')),
  notes TEXT,
  address TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own visits" ON visits;
DROP POLICY IF EXISTS "Users can insert their own visits" ON visits;
DROP POLICY IF EXISTS "Users can update their own visits" ON visits;
DROP POLICY IF EXISTS "Users can delete their own visits" ON visits;

-- Create policies
CREATE POLICY "Users can view their own visits" ON visits
  FOR SELECT USING (auth.uid() = created_by);

CREATE POLICY "Users can insert their own visits" ON visits
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own visits" ON visits
  FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own visits" ON visits
  FOR DELETE USING (auth.uid() = created_by);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS visits_customer_id_idx ON visits(customer_id);
CREATE INDEX IF NOT EXISTS visits_created_by_idx ON visits(created_by);
CREATE INDEX IF NOT EXISTS visits_scheduled_date_idx ON visits(scheduled_date);
CREATE INDEX IF NOT EXISTS visits_status_idx ON visits(status);
CREATE INDEX IF NOT EXISTS visits_created_at_idx ON visits(created_at DESC);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_visits_updated_at ON visits;
CREATE TRIGGER update_visits_updated_at 
    BEFORE UPDATE ON visits 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
