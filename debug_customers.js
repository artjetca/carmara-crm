import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkCustomers() {
  console.log('Checking customers table...')
  
  // 查詢所有客戶
  const { data: allCustomers, error: allError } = await supabase
    .from('customers')
    .select('id, name, company, created_by')
    .limit(10)
  
  if (allError) {
    console.error('Error fetching all customers:', allError)
  } else {
    console.log('All customers (first 10):', allCustomers)
  }
  
  // 檢查是否有任何記錄
  const { count, error: countError } = await supabase
    .from('customers')
    .select('*', { count: 'exact', head: true })
  
  if (countError) {
    console.error('Error counting customers:', countError)
  } else {
    console.log('Total customers count:', count)
  }
}

checkCustomers().catch(console.error)
