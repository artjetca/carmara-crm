import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables:')
  console.error('SUPABASE_URL:', !!supabaseUrl)
  console.error('SUPABASE_SERVICE_ROLE_KEY:', !!supabaseServiceKey)
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function createSavedRoutesTable() {
  console.log('Creating saved_routes table...')
  
  try {
    // Create the table with all necessary components
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: `
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
      `
    })

    if (error) {
      console.error('❌ Failed to create table:', error)
      return false
    }

    console.log('✅ saved_routes table created successfully')
    
    // Verify table exists
    const { data: tableCheck, error: checkError } = await supabase
      .from('saved_routes')
      .select('count(*)')
      .limit(1)
    
    if (checkError) {
      console.error('❌ Table verification failed:', checkError)
      return false
    }
    
    console.log('✅ Table verification passed')
    return true
    
  } catch (error) {
    console.error('❌ Unexpected error:', error)
    return false
  }
}

// Alternative method using direct SQL execution
async function createTableDirectSQL() {
  console.log('Attempting direct SQL execution...')
  
  const sqlCommands = [
    `CREATE TABLE IF NOT EXISTS saved_routes (
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
    );`,
    
    `ALTER TABLE saved_routes ENABLE ROW LEVEL SECURITY;`,
    
    `CREATE POLICY "Users can view their own routes" ON saved_routes
      FOR SELECT USING (auth.uid() = created_by);`,
    
    `CREATE POLICY "Users can insert their own routes" ON saved_routes
      FOR INSERT WITH CHECK (auth.uid() = created_by);`,
    
    `CREATE POLICY "Users can update their own routes" ON saved_routes
      FOR UPDATE USING (auth.uid() = created_by);`,
    
    `CREATE POLICY "Users can delete their own routes" ON saved_routes
      FOR DELETE USING (auth.uid() = created_by);`,
    
    `CREATE INDEX IF NOT EXISTS saved_routes_created_by_idx ON saved_routes(created_by);`,
    
    `CREATE INDEX IF NOT EXISTS saved_routes_created_at_idx ON saved_routes(created_at DESC);`
  ]
  
  for (const sql of sqlCommands) {
    try {
      const { error } = await supabase.rpc('exec_sql', { sql })
      if (error) {
        console.error('❌ SQL command failed:', sql.substring(0, 50) + '...', error)
      } else {
        console.log('✅ SQL executed:', sql.substring(0, 50) + '...')
      }
    } catch (err) {
      console.error('❌ Exception:', err)
    }
  }
}

// Run the creation
createSavedRoutesTable()
  .then(success => {
    if (!success) {
      console.log('\nTrying alternative method...')
      return createTableDirectSQL()
    }
    return true
  })
  .then(() => {
    console.log('\n🎉 Migration completed!')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  })
