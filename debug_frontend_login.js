import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Use the same configuration as frontend
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing frontend Supabase environment variables');
  console.log('VITE_SUPABASE_URL:', supabaseUrl ? '✓' : '❌');
  console.log('VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? '✓' : '❌');
  process.exit(1);
}

// Create client exactly like frontend does
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const testEmail = 'rosariog.almenglo@gmail.com';
const testPassword = 'admin123';

async function testFrontendLogin() {
  console.log('🔍 Testing frontend login simulation for:', testEmail);
  console.log('📧 Password:', testPassword);
  console.log('🌐 Supabase URL:', supabaseUrl);
  console.log('🔑 Using ANON key (like frontend):', supabaseAnonKey.substring(0, 20) + '...');
  
  console.log('\n=== Testing signInWithPassword (frontend method) ===');
  
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    });
    
    if (error) {
      console.error('❌ Frontend login failed:');
      console.error('   Message:', error.message);
      console.error('   Status:', error.status);
      console.error('   Name:', error.name);
      console.error('   Full error:', JSON.stringify(error, null, 2));
      
      // Check for specific error patterns
      if (error.message.includes('Invalid login credentials')) {
        console.log('\n🔍 "Invalid login credentials" error detected');
        console.log('   This usually means:');
        console.log('   1. Wrong email/password combination');
        console.log('   2. User account is disabled');
        console.log('   3. Email not confirmed (though our test showed it was)');
        console.log('   4. Rate limiting');
      }
      
      if (error.message.includes('Email not confirmed')) {
        console.log('\n📧 Email confirmation required');
      }
      
      if (error.message.includes('Too many requests')) {
        console.log('\n⏰ Rate limiting detected');
      }
      
    } else {
      console.log('✅ Frontend login successful!');
      console.log('   User ID:', data.user?.id);
      console.log('   Email:', data.user?.email);
      console.log('   Email confirmed:', data.user?.email_confirmed_at ? '✅' : '❌');
      console.log('   Session expires:', data.session?.expires_at);
      console.log('   Access token length:', data.session?.access_token?.length);
    }
    
  } catch (error) {
    console.error('💥 Unexpected error during login:', error.message);
    console.error('   Stack:', error.stack);
  }
  
  console.log('\n=== Testing session retrieval ===');
  
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.error('❌ Session retrieval failed:', sessionError.message);
    } else {
      console.log('✅ Session status:', sessionData.session ? 'Active' : 'None');
      if (sessionData.session) {
        console.log('   Session user:', sessionData.session.user?.email);
      }
    }
  } catch (error) {
    console.error('💥 Session check failed:', error.message);
  }
}

// Run the test
testFrontendLogin().then(() => {
  console.log('\n🏁 Frontend login test completed');
}).catch(error => {
  console.error('💥 Test failed:', error.message);
});