const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://aotpcnwjjpkzxnhvmcvb.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function debugCustomerLoading() {
  if (!serviceRoleKey) {
    console.log('❌ Missing SUPABASE_SERVICE_ROLE_KEY');
    return;
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { 
    auth: { autoRefreshToken: false, persistSession: false } 
  });

  console.log('=== CUSTOMER LOADING DEBUG ===');
  
  // Get all customers
  const { data: allCustomers, error } = await admin
    .from('customers')
    .select('*')
    .order('name');

  if (error) {
    console.log('❌ Error loading customers:', error.message);
    return;
  }

  console.log(`📊 Total customers in database: ${allCustomers.length}`);
  
  if (allCustomers.length > 0) {
    console.log('\n=== SAMPLE CUSTOMERS ===');
    allCustomers.slice(0, 5).forEach(customer => {
      console.log(`Customer: ${customer.name}`);
      console.log(`  ID: ${customer.id}`);
      console.log(`  City: '${customer.city || 'null'}'`);
      console.log(`  Province: '${customer.province || 'null'}'`);
      console.log(`  Created by: ${customer.created_by || 'null'}`);
      console.log(`  Customer type: ${customer.customer_type || 'null'}`);
      console.log('');
    });

    // Check for Huelva customers
    const huelvaCustomers = allCustomers.filter(c => 
      c.city === 'Huelva' || c.province === 'Huelva' || 
      (c.city && c.city.toLowerCase().includes('huelva'))
    );
    console.log(`🏛️ Customers with Huelva connection: ${huelvaCustomers.length}`);
    
    // Check created_by distribution
    const createdByStats = {};
    allCustomers.forEach(c => {
      const key = c.created_by || 'null';
      createdByStats[key] = (createdByStats[key] || 0) + 1;
    });
    console.log('\n📈 Created by distribution:');
    Object.entries(createdByStats).forEach(([userId, count]) => {
      console.log(`  ${userId}: ${count} customers`);
    });
  }
}

debugCustomerLoading().catch(console.error);
