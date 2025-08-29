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

// 模擬前端的 displayProvince 函數
const isProvinceName = (v) => {
  const s = String(v || '').trim().toLowerCase()
  return s === 'huelva' || s === 'cádiz' || s === 'cadiz'
}

const toCanonicalProvince = (v) => {
  const s = String(v || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // 去除重音符號
  if (s === 'huelva') return 'Huelva'
  if (s === 'cadiz') return 'Cádiz'
  return ''
}

const displayProvince = (c) => {
  if (!c) return ''
  try {
    // 優先使用資料表中的 province 欄位
    if (c.province && String(c.province).trim().length > 0) {
      const can = toCanonicalProvince(c.province)
      if (can) return can
    }
    // 從 notes 中解析省份
    if (c.notes) {
      const m = c.notes.match(/Provincia:\s*([^\n]+)/i)
      if (m) {
        const can = toCanonicalProvince(m[1])
        if (can) return can
      }
    }
    // 最後才檢查 city 是否為省份名稱
    if (c.city && isProvinceName(c.city)) {
      const can = toCanonicalProvince(c.city)
      if (can) return can
    }
    return ''
  } catch (error) {
    console.error('[DISPLAY_PROVINCE] Error processing customer:', c, error)
    return ''
  }
}

async function debugMapFilteringDetailed() {
  console.log('=== 詳細調試地圖篩選功能 ===\n')
  
  try {
    // 獲取所有客戶數據
    const { data: customers, error } = await supabase
      .from('customers')
      .select('*')
      .limit(5)
    
    if (error) {
      console.error('Error fetching customers:', error)
      return
    }
    
    console.log(`找到 ${customers.length} 個客戶記錄\n`)
    
    // 測試篩選邏輯
    const selectedProvince = 'Huelva'
    console.log(`測試篩選省份: "${selectedProvince}"\n`)
    
    customers.forEach((customer, index) => {
      console.log(`客戶 ${index + 1}: ${customer.name}`)
      console.log(`  city: "${customer.city}"`)
      console.log(`  province: "${customer.province}"`)
      console.log(`  notes: "${customer.notes?.substring(0, 50) || ''}"`)
      
      const customerProvince = displayProvince(customer)
      console.log(`  displayProvince(): "${customerProvince}"`)
      console.log(`  toCanonicalProvince(customerProvince): "${toCanonicalProvince(customerProvince)}"`)
      console.log(`  toCanonicalProvince(selectedProvince): "${toCanonicalProvince(selectedProvince)}"`)
      
      const matchesProvince = toCanonicalProvince(customerProvince) === toCanonicalProvince(selectedProvince)
      console.log(`  匹配省份: ${matchesProvince}`)
      console.log('---')
    })
    
    // 模擬前端篩選邏輯
    const filteredCustomers = customers.filter(customer => {
      if (!customer) return false
      
      // 檢查省份是否匹配
      const customerProvince = displayProvince(customer)
      const matchesProvince = toCanonicalProvince(customerProvince) === toCanonicalProvince(selectedProvince)
      
      return matchesProvince
    })
    
    console.log(`\n篩選結果: ${filteredCustomers.length} 個客戶匹配 "${selectedProvince}" 省份`)
    filteredCustomers.forEach((customer, index) => {
      console.log(`  ${index + 1}. ${customer.name}`)
    })
    
  } catch (error) {
    console.error('調試過程中發生錯誤:', error)
  }
}

debugMapFilteringDetailed()
