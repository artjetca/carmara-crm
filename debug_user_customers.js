import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function debugUserCustomers() {
  console.log('=== 調試用戶客戶數據 ===\n')
  
  try {
    // 獲取所有用戶
    const { data: users, error: usersError } = await supabase.auth.admin.listUsers()
    
    if (usersError) {
      console.error('Error fetching users:', usersError)
      return
    }
    
    console.log(`找到 ${users.users.length} 個用戶`)
    users.users.forEach((user, index) => {
      console.log(`用戶 ${index + 1}: ${user.email} (ID: ${user.id})`)
    })
    console.log('')
    
    // 獲取所有客戶及其創建者
    const { data: customers, error } = await supabase
      .from('customers')
      .select('id, name, created_by, province, city')
      .limit(10)
    
    if (error) {
      console.error('Error fetching customers:', error)
      return
    }
    
    console.log(`找到 ${customers.length} 個客戶記錄\n`)
    
    // 分析客戶創建者
    const creatorStats = {}
    
    customers.forEach((customer, index) => {
      console.log(`客戶 ${index + 1}: ${customer.name}`)
      console.log(`  ID: ${customer.id}`)
      console.log(`  Province: ${customer.province}`)
      console.log(`  City: ${customer.city}`)
      console.log(`  Created by: ${customer.created_by}`)
      
      const creator = customer.created_by || 'null'
      creatorStats[creator] = (creatorStats[creator] || 0) + 1
      
      console.log('---')
    })
    
    console.log('\n=== 創建者統計 ===')
    Object.entries(creatorStats).forEach(([creator, count]) => {
      const user = users.users.find(u => u.id === creator)
      const email = user ? user.email : 'Unknown'
      console.log(`${creator} (${email}): ${count} 個客戶`)
    })
    
  } catch (error) {
    console.error('調試過程中發生錯誤:', error)
  }
}

debugUserCustomers()
