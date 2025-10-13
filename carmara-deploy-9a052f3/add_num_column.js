const { createClient } = require('@supabase/supabase-js')

// Replace with your actual Supabase URL and service role key
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-role-key'

const supabase = createClient(supabaseUrl, supabaseKey)

async function addNumColumn() {
  try {
    console.log('Adding num column to customers table...')
    
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: `
        -- Add num column to customers table
        ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS num TEXT;
        
        -- Add company column if it doesn't exist
        ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS company TEXT;
        
        -- Add contrato column if it doesn't exist
        ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS contrato TEXT;
      `
    })

    if (error) {
      console.error('Error adding columns:', error)
      return
    }

    console.log('✅ Successfully added num, company, and contrato columns to customers table')
  } catch (err) {
    console.error('Error:', err.message)
  }
}

addNumColumn()
