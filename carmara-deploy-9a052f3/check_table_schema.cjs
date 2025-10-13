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

async function checkTableSchema() {
  console.log('Checking customers table schema...');
  
  // 查询表结构
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .limit(1);
  
  if (error) {
    console.error('❌ Error fetching table schema:', error.message);
    process.exit(1);
  }
  
  if (data.length > 0) {
    console.log('Table columns:');
    Object.keys(data[0]).forEach(column => {
      console.log(`- ${column}`);
    });
  } else {
    console.log('Table is empty or does not exist');
  }
}

checkTableSchema();
