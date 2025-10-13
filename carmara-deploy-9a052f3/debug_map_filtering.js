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

async function debugMapFiltering() {
  console.log('=== 調試地圖篩選功能 ===\n')
  
  try {
    // 檢查所有省份數據
    const { data: allCustomers, error: allError } = await supabase
      .from('customers')
      .select('province')
    
    if (allError) {
      console.error('Error fetching all customers:', allError)
      return
    }
    
    const allProvinces = [...new Set(allCustomers.map(c => c.province).filter(Boolean))]
    console.log('所有省份:', allProvinces)
    
    // 獲取 Huelva 和 Cádiz 客戶數據
    const { data: customers, error } = await supabase
      .from('customers')
      .select('*')
      .or('province.eq.Huelva,province.eq.Cádiz')
      .limit(10)
    
    if (error) {
      console.error('Error fetching customers:', error)
      return
    }
    
    console.log(`找到 ${customers.length} 個客戶記錄\n`)
    
    // 分析省份和城市數據
    const provinceStats = {}
    const cityStats = {}
    
    customers.forEach((customer, index) => {
      console.log(`客戶 ${index + 1}:`)
      console.log(`  姓名: ${customer.name}`)
      console.log(`  city 欄位: "${customer.city}"`)
      console.log(`  province 欄位: "${customer.province}"`)
      console.log(`  notes: "${customer.notes?.substring(0, 100) || ''}"`)
      
      // 統計省份
      const province = customer.province || 'null'
      provinceStats[province] = (provinceStats[province] || 0) + 1
      
      // 統計城市
      const city = customer.city || 'null'
      cityStats[city] = (cityStats[city] || 0) + 1
      
      console.log('---')
    })
    
    console.log('\n=== 省份統計 ===')
    Object.entries(provinceStats).forEach(([province, count]) => {
      console.log(`${province}: ${count} 個客戶`)
    })
    
    console.log('\n=== 城市統計 ===')
    Object.entries(cityStats).forEach(([city, count]) => {
      console.log(`${city}: ${count} 個客戶`)
    })
    
  } catch (error) {
    console.error('調試過程中發生錯誤:', error)
  }
}

debugMapFiltering()
