import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function checkUserTables() {
  console.log('🔍 Checking available user tables...\n')
  
  const tablesToCheck = ['profiles', 'user_profiles', 'users']
  
  for (const table of tablesToCheck) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .limit(1)
    
    if (error) {
      console.log(`❌ ${table}: ${error.message}`)
    } else {
      console.log(`✅ ${table}: exists`)
      if (data && data.length > 0) {
        console.log(`   Columns: ${Object.keys(data[0]).join(', ')}`)
      }
    }
  }
  
  // Check auth.users access
  console.log('\n🔍 Checking auth context...')
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    console.log('❌ No authenticated user')
  } else {
    console.log('✅ Authenticated user:', user.id)
  }
}

checkUserTables().catch(console.error)
