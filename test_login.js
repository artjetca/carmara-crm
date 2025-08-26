import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
  console.error('❌ Missing Supabase environment variables');
  console.log('VITE_SUPABASE_URL:', supabaseUrl ? '✓' : '❌');
  console.log('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '❌');
  console.log('VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? '✓' : '❌');
  process.exit(1);
}

// Create both admin and client instances
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

const testEmail = process.env.TARGET_EMAIL || 'rosariog.almenglo@gmail.com';
const testPassword = process.env.NEW_PASSWORD || 'admin123';

async function testLogin() {
  console.log('🔍 Testing login for:', testEmail);
  console.log('📧 Password:', testPassword);
  console.log('\n=== Step 1: Check user exists in auth.users ===');
  
  try {
    // Check if user exists in auth.users
    const { data: users, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (usersError) {
      console.error('❌ Error fetching users:', usersError.message);
      return;
    }
    
    const targetUser = users.users.find(user => user.email === testEmail);
    
    if (!targetUser) {
      console.error('❌ User not found in auth.users table');
      return;
    }
    
    console.log('✅ User found in auth.users:');
    console.log('  - ID:', targetUser.id);
    console.log('  - Email:', targetUser.email);
    console.log('  - Email confirmed:', targetUser.email_confirmed_at ? '✅ Yes' : '❌ No');
    console.log('  - Created at:', targetUser.created_at);
    console.log('  - Last sign in:', targetUser.last_sign_in_at || 'Never');
    console.log('  - User metadata:', JSON.stringify(targetUser.user_metadata, null, 2));
    console.log('  - App metadata:', JSON.stringify(targetUser.app_metadata, null, 2));
    
    console.log('\n=== Step 2: Check auth settings ===');
    
    // Try to get auth settings (this might not work with client SDK)
    try {
      const { data: settings, error: settingsError } = await supabaseAdmin
        .from('auth.config')
        .select('*');
      
      if (!settingsError && settings) {
        console.log('✅ Auth settings:', settings);
      } else {
        console.log('ℹ️  Cannot fetch auth settings (expected with client SDK)');
      }
    } catch (e) {
      console.log('ℹ️  Cannot fetch auth settings:', e.message);
    }
    
    console.log('\n=== Step 3: Test login with client SDK ===');
    
    // Test login with client SDK (simulating frontend)
    const { data: loginData, error: loginError } = await supabaseClient.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    });
    
    if (loginError) {
      console.error('❌ Login failed:', loginError.message);
      console.error('   Error code:', loginError.status);
      console.error('   Full error:', JSON.stringify(loginError, null, 2));
      
      // Check specific error types
      if (loginError.message.includes('Invalid login credentials')) {
        console.log('\n🔍 Possible causes:');
        console.log('  1. Password was not actually updated');
        console.log('  2. Email confirmation required');
        console.log('  3. User account is disabled');
        console.log('  4. Rate limiting in effect');
      }
      
      if (loginError.message.includes('Email not confirmed')) {
        console.log('\n📧 Email confirmation required!');
        console.log('   Attempting to confirm email...');
        
        // Try to confirm email manually
        const { error: confirmError } = await supabaseAdmin.auth.admin.updateUserById(
          targetUser.id,
          { email_confirm: true }
        );
        
        if (confirmError) {
          console.error('❌ Failed to confirm email:', confirmError.message);
        } else {
          console.log('✅ Email confirmed manually');
          console.log('   Please try logging in again');
        }
      }
    } else {
      console.log('✅ Login successful!');
      console.log('   User ID:', loginData.user?.id);
      console.log('   Email:', loginData.user?.email);
      console.log('   Session:', loginData.session ? 'Created' : 'None');
    }
    
    console.log('\n=== Step 4: Verify password was actually changed ===');
    
    // Try to reset password again to verify it's working
    const { error: resetError } = await supabaseAdmin.auth.admin.updateUserById(
      targetUser.id,
      { password: testPassword }
    );
    
    if (resetError) {
      console.error('❌ Failed to reset password again:', resetError.message);
    } else {
      console.log('✅ Password reset confirmed');
    }
    
    console.log('\n=== Step 5: Test login again after confirmation ===');
    
    // Test login again
    const { data: loginData2, error: loginError2 } = await supabaseClient.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    });
    
    if (loginError2) {
      console.error('❌ Second login attempt failed:', loginError2.message);
    } else {
      console.log('✅ Second login attempt successful!');
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    console.error('   Stack:', error.stack);
  }
}

// Run the test
testLogin().then(() => {
  console.log('\n🏁 Login test completed');
}).catch(error => {
  console.error('💥 Test failed:', error.message);
});