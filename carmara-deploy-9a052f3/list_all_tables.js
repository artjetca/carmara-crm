import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function listTables() {
  console.log('🔍 Listing all accessible tables...\n')
  
  // Try to get table list from information_schema
  const { data, error } = await supabase
    .rpc('exec_sql', { 
      sql_query: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;" 
    })
  
  if (error) {
    console.log('❌ Cannot query information_schema, trying known tables...')
    
    const knownTables = ['customers', 'visits', 'profiles', 'user_profiles', 'scheduled_messages']
    
    for (const table of knownTables) {
      const { error: tableError } = await supabase
        .from(table)
        .select('id')
        .limit(1)
      
      if (tableError) {
        console.log(`❌ ${table}: ${tableError.message}`)
      } else {
        console.log(`✅ ${table}: exists`)
      }
    }
  } else {
    console.log('✅ Available tables:')
    if (data && Array.isArray(data)) {
      data.forEach(row => console.log(`  - ${row.table_name}`))
    }
  }
}

listTables().catch(console.error)
