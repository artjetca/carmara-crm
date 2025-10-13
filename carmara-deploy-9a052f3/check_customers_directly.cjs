const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load .env.local file
function loadEnvLocal() {
  const envPath = path.join(__dirname, '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');
    lines.forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) {
        process.env[key] = value;
      }
    });
  }
}

// Test direct connection to customers table
async function testCustomersConnection() {
  console.log('Testing direct Supabase connection...');
  
  // Load environment variables
  loadEnvLocal();
  
  // Use the same URL as in customers.js
  const supabaseUrl = 'https://mddyomibqbmnpexwgkug.supabase.co';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  console.log('Supabase URL:', supabaseUrl);
  console.log('Service role key exists:', !!serviceRoleKey);
  console.log('Service role key length:', serviceRoleKey ? serviceRoleKey.length : 0);
  
  if (!serviceRoleKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY not found in environment');
    return;
  }
  
  try {
    const admin = createClient(supabaseUrl, serviceRoleKey, { 
      auth: { autoRefreshToken: false, persistSession: false } 
    });
    
    console.log('✅ Supabase client created');
    
    // Test customers table
    const { data, error, count } = await admin
      .from('customers')
      .select('*', { count: 'exact' })
      .limit(5);
      
    if (error) {
      console.error('❌ Error querying customers:', error);
      return;
    }
    
    console.log('✅ Customers query successful');
    console.log('Total customers count:', count);
    console.log('Sample data (first 5):');
    console.log(JSON.stringify(data, null, 2));
    
    // Test specific customer fields we need
    if (data && data.length > 0) {
      const sample = data[0];
      console.log('\n📊 Sample customer structure:');
      console.log('- ID:', sample.id);
      console.log('- Name:', sample.name);
      console.log('- City:', sample.city);
      console.log('- Notes:', sample.notes ? 'Has notes' : 'No notes');
    }
    
  } catch (e) {
    console.error('❌ Connection failed:', e.message);
  }
}

testCustomersConnection();
