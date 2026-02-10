import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function debugSchema() {
  console.log('🔍 Debugging scheduled_messages schema...\n')
  
  // Test 1: Try to select all columns to see what exists
  console.log('1. Testing table access...')
  const { data, error } = await supabase
    .from('scheduled_messages')
    .select('*')
    .limit(1)
  
  if (error) {
    console.log('❌ Table access error:', error)
    return
  }
  
  console.log('✅ Table accessible')
  if (data && data.length > 0) {
    console.log('📋 Existing columns:', Object.keys(data[0]).join(', '))
  } else {
    console.log('📋 No existing rows, testing individual columns...')
    
    // Test each column individually
    const columnsToTest = ['id', 'customer_id', 'type', 'subject', 'message', 'scheduled_for', 'status', 'user_id', 'created_at', 'error_message']
    
    for (const col of columnsToTest) {
      const { error: colError } = await supabase
        .from('scheduled_messages')
        .select(col)
        .limit(1)
      
      if (colError) {
        console.log(`❌ Column '${col}': ${colError.message}`)
      } else {
        console.log(`✅ Column '${col}': exists`)
      }
    }
  }
  
  // Test 2: Check user_profiles vs profiles
  console.log('\n2. Testing user table...')
  const { error: userProfilesError } = await supabase
    .from('user_profiles')
    .select('id')
    .limit(1)
  
  if (userProfilesError) {
    console.log('❌ user_profiles error:', userProfilesError.message)
    
    const { error: profilesError } = await supabase
      .from('profiles')
      .select('id')
      .limit(1)
    
    if (profilesError) {
      console.log('❌ profiles error:', profilesError.message)
    } else {
      console.log('✅ profiles table exists')
    }
  } else {
    console.log('✅ user_profiles table exists')
  }
  
  // Test 3: Check current user
  console.log('\n3. Testing current user...')
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    console.log('❌ No authenticated user')
  } else {
    console.log('✅ Authenticated user:', user.id)
  }
}

debugSchema().catch(console.error)
