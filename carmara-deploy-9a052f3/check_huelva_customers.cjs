require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// 初始化 Supabase 客戶端
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkHuelvaCustomers() {
  console.log('Checking Huelva customers...');
  
  // 查询所有Huelva客户
  const { data: huelvaCustomers, error } = await supabase
    .from('customers')
    .select('*')
    .or('city.eq.Huelva,province.eq.Huelva');
  
  if (error) {
    console.error('❌ Error fetching Huelva customers:', error.message);
    process.exit(1);
  }
  
  console.log(`Found ${huelvaCustomers.length} customers with city or province = Huelva:`);
  
  huelvaCustomers.forEach(customer => {
    console.log(`- ${customer.name}: city="${customer.city}", province="${customer.province}"`);
  });
  
  // 查询city为Huelva但province为null的客户
  const { data: inconsistentCustomers, error: error2 } = await supabase
    .from('customers')
    .select('*')
    .eq('city', 'Huelva')
    .is('province', null);
  
  if (error2) {
    console.error('❌ Error fetching inconsistent customers:', error2.message);
    process.exit(1);
  }
  
  console.log(`\nFound ${inconsistentCustomers.length} customers with city=Huelva but province=null:`);
  
  inconsistentCustomers.forEach(customer => {
    console.log(`- ${customer.name}: city="${customer.city}", province="${customer.province}"`);
  });
}

checkHuelvaCustomers();
