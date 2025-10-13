require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// 初始化 Supabase 客戶端
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixHuelvaCustomers() {
  console.log('Fixing Huelva customers with missing province...');
  
  // 查询city为Huelva但province为null的客户
  const { data: inconsistentCustomers, error: fetchError } = await supabase
    .from('customers')
    .select('id, name, city, province')
    .eq('city', 'Huelva')
    .is('province', null);
  
  if (fetchError) {
    console.error('❌ Error fetching inconsistent customers:', fetchError.message);
    process.exit(1);
  }
  
  console.log(`Found ${inconsistentCustomers.length} customers with city=Huelva but province=null:`);
  
  // 更新这些客户的province字段
  for (const customer of inconsistentCustomers) {
    console.log(`- Fixing ${customer.name}: setting province to "Huelva"`);
    
    const { error: updateError } = await supabase
      .from('customers')
      .update({ province: 'Huelva' })
      .eq('id', customer.id);
    
    if (updateError) {
      console.error(`  ❌ Error updating customer ${customer.name}:`, updateError.message);
    } else {
      console.log(`  ✅ Successfully updated customer ${customer.name}`);
    }
  }
  
  console.log('Finished fixing Huelva customers.');
}

fixHuelvaCustomers();
