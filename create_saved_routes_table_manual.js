const { createClient } = require('@supabase/supabase-js')

async function createSavedRoutesTable() {
  // Using service role key to create table
  const supabaseUrl = 'https://aotpcnwjjpkzxnhvmcvb.supabase.co'
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!serviceRoleKey) {
    console.log('❌ Need SUPABASE_SERVICE_ROLE_KEY to create table')
    console.log('Please set it in your environment variables')
    return
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const createTableSQL = `
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
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed BOOLEAN DEFAULT FALSE
  );

  -- Enable RLS
  ALTER TABLE saved_routes ENABLE ROW LEVEL SECURITY;

  -- Create policies
  DROP POLICY IF EXISTS "Users can view their own routes" ON saved_routes;
  CREATE POLICY "Users can view their own routes" ON saved_routes
    FOR SELECT USING (auth.uid() = created_by);

  DROP POLICY IF EXISTS "Users can insert their own routes" ON saved_routes;
  CREATE POLICY "Users can insert their own routes" ON saved_routes
    FOR INSERT WITH CHECK (auth.uid() = created_by);

  DROP POLICY IF EXISTS "Users can update their own routes" ON saved_routes;
  CREATE POLICY "Users can update their own routes" ON saved_routes
    FOR UPDATE USING (auth.uid() = created_by);

  DROP POLICY IF EXISTS "Users can delete their own routes" ON saved_routes;
  CREATE POLICY "Users can delete their own routes" ON saved_routes
    FOR DELETE USING (auth.uid() = created_by);

  -- Create indexes
  CREATE INDEX IF NOT EXISTS saved_routes_created_by_idx ON saved_routes(created_by);
  CREATE INDEX IF NOT EXISTS saved_routes_created_at_idx ON saved_routes(created_at DESC);

  -- Create updated_at trigger
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
  `

  try {
    console.log('🔨 Creating saved_routes table...')
    const { data, error } = await supabase.rpc('exec', { sql: createTableSQL })
    
    if (error) {
      console.log('❌ Error creating table:', error.message)
    } else {
      console.log('✅ saved_routes table created successfully!')
      
      // Test the table
      const testQuery = await supabase.from('saved_routes').select('count').limit(1)
      console.log('✅ Table test:', testQuery.error ? 'FAILED' : 'SUCCESS')
    }
  } catch (e) {
    console.log('❌ Execution error:', e.message)
  }
}

createSavedRoutesTable()
