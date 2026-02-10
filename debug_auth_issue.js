// Debug authentication issue in Communications page
const { createClient } = require('@supabase/supabase-js');

async function debugAuthIssue() {
  console.log('🔍 Debugging Supabase authentication issue...\n');
  
  // Check environment variables
  console.log('Environment Variables:');
  console.log('- VITE_SUPABASE_URL:', process.env.VITE_SUPABASE_URL ? '✅ Set' : '❌ Missing');
  console.log('- VITE_SUPABASE_ANON_KEY:', process.env.VITE_SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing');
  console.log('');

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://aotpcnwjjpkzxnhvmcvb.supabase.co';
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseKey) {
      console.log('❌ Cannot test without VITE_SUPABASE_ANON_KEY');
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Test basic connection
    console.log('📡 Testing Supabase connection...');
    const { data: session, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.log('❌ Session error:', sessionError.message);
    } else {
      console.log('✅ Connection successful');
      console.log('Current session:', session?.session ? '🔐 Authenticated' : '🚫 Not authenticated');
      
      if (session?.session?.user) {
        console.log('User ID:', session.session.user.id);
        console.log('User email:', session.session.user.email);
        console.log('Session expires:', new Date(session.session.expires_at * 1000));
      }
    }
    
    // Test database access
    if (session?.session) {
      console.log('\n📝 Testing database access...');
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .limit(1);
        
      if (profileError) {
        console.log('❌ Database error:', profileError.message);
      } else {
        console.log('✅ Database access successful');
      }
    }
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
  }
}

// Check potential issues
console.log('🔧 Common authentication issues:');
console.log('1. Session expired - user needs to log in again');
console.log('2. Invalid credentials stored in browser');
console.log('3. Network connectivity issues');
console.log('4. Supabase service temporarily down');
console.log('5. RLS policies blocking access');
console.log('');

debugAuthIssue();
