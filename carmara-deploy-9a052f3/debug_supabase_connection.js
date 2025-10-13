import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

console.log('🔍 Debugging Supabase Connection...\n')

// Check environment variables
console.log('Environment Variables:')
console.log('VITE_SUPABASE_URL:', process.env.VITE_SUPABASE_URL ? '✅ Set' : '❌ Missing')
console.log('VITE_SUPABASE_ANON_KEY:', process.env.VITE_SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing')
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ Missing')
console.log('')

if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) {
  console.log('❌ Missing required Supabase environment variables')
  process.exit(1)
}

// Test anon key connection
console.log('Testing anon key connection...')
const supabaseAnon = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

try {
  const { data, error } = await supabaseAnon.from('scheduled_messages').select('count').limit(1)
  if (error) {
    console.log('❌ Anon key error:', error.message)
  } else {
    console.log('✅ Anon key connection successful')
  }
} catch (err) {
  console.log('❌ Anon key connection failed:', err.message)
}

// Test service role key connection if available
if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log('\nTesting service role key connection...')
  const supabaseService = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
  
  try {
    const { data, error } = await supabaseService.from('scheduled_messages').select('count').limit(1)
    if (error) {
      console.log('❌ Service role error:', error.message)
    } else {
      console.log('✅ Service role connection successful')
    }
  } catch (err) {
    console.log('❌ Service role connection failed:', err.message)
  }
}

// Test authentication
console.log('\nTesting authentication...')
try {
  const { data: { session }, error } = await supabaseAnon.auth.getSession()
  if (error) {
    console.log('❌ Auth session error:', error.message)
  } else if (session) {
    console.log('✅ User authenticated:', session.user.email)
  } else {
    console.log('ℹ️ No active session (user not logged in)')
  }
} catch (err) {
  console.log('❌ Auth check failed:', err.message)
}

console.log('\n🔍 Debug complete')
