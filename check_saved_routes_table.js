const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

async function checkSavedRoutesTable() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://aotpcnwjjpkzxnhvmcvb.supabase.co'
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
  
  if (!supabaseKey) {
    console.log('❌ Missing VITE_SUPABASE_ANON_KEY in environment')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  
  console.log('🔍 Checking saved_routes table...')
  
  try {
    const { data, error } = await supabase
      .from('saved_routes')
      .select('count')
      .limit(1)
    
    if (error) {
      console.log('❌ saved_routes table MISSING - 404 Error')
      console.log('Error details:', error.message)
      console.log('⚠️  Need to create the table in Supabase')
      return false
    } else {
      console.log('✅ saved_routes table EXISTS')
      return true
    }
  } catch (e) {
    console.log('❌ Connection error:', e.message)
    return false
  }
}

checkSavedRoutesTable()
