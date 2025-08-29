const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables. Please check .env file.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// 標準化省份名稱
const normalizeProvince = (input) => {
  if (!input) return null
  const v = input.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (v === 'huelva') return 'Huelva'
  if (v === 'cadiz') return 'Cádiz'
  return null
}

// 標準化城市名稱
const normalizeCity = (input) => {
  if (!input) return null
  const v = input.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (v === 'huelva') return 'Huelva'
  if (v === 'cadiz') return 'Cádiz'
  return null
}

// 從 notes 中提取省份
const extractProvinceFromNotes = (notes) => {
  if (!notes) return null
  const match = notes.match(/Provincia:\s*([^\n|]+)/i)
  return match ? match[1].trim() : null
}

// 從 notes 中提取城市
const extractCityFromNotes = (notes) => {
  if (!notes) return null
  const match = notes.match(/Ciudad:\s*([^\n|]+)/i)
  return match ? match[1].trim() : null
}

// 清理 notes 中的省份和城市標籤
const cleanNotes = (notes) => {
  if (!notes) return null
  let cleaned = notes
  // 移除省份和城市標籤
  cleaned = cleaned.replace(/\s*\|\s*Provincia:\s*[^|\n]+/gi, '')
  cleaned = cleaned.replace(/\s*\|\s*Ciudad:\s*[^|\n]+/gi, '')
  cleaned = cleaned.replace(/(^|\n)\s*Provincia:\s*[^\n]+/gi, '')
  cleaned = cleaned.replace(/(^|\n)\s*Ciudad:\s*[^\n]+/gi, '')
  // 清理多餘的分隔符
  cleaned = cleaned.replace(/\s*\|\s*/g, ' | ').replace(/^(\s*\|\s*)+|(\s*\|\s*)+$/g, '')
  return cleaned.trim() || null
}

async function analyzeCustomerData() {
  console.log('🔍 分析客戶數據...')
  
  const { data: customers, error } = await supabase
    .from('customers')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('❌ 無法載入客戶數據:', error)
    return
  }

  console.log(`📊 總共找到 ${customers.length} 個客戶記錄`)

  let issuesFound = 0
  const issues = []

  customers.forEach((customer, index) => {
    const problems = []
    
    // 檢查 city 欄位
    if (customer.city) {
      const normalizedCity = normalizeCity(customer.city)
      if (!normalizedCity && (customer.city === 'Huelva' || customer.city === 'Cádiz')) {
        // 這種情況不應該發生，因為 Huelva 和 Cádiz 應該能被標準化
        problems.push(`city 欄位 "${customer.city}" 無法標準化`)
      }
    }

    // 檢查 province 欄位
    if (customer.province) {
      const normalizedProvince = normalizeProvince(customer.province)
      if (!normalizedProvince) {
        problems.push(`province 欄位 "${customer.province}" 無法標準化`)
      }
    }

    // 檢查 notes 中的省份和城市資訊
    const notesProvince = extractProvinceFromNotes(customer.notes)
    const notesCity = extractCityFromNotes(customer.notes)

    if (notesProvince || notesCity) {
      problems.push(`notes 中包含省份/城市標籤: ${notesProvince ? `Provincia: ${notesProvince}` : ''} ${notesCity ? `Ciudad: ${notesCity}` : ''}`)
    }

    // 檢查省份和城市的一致性
    if (customer.city && customer.province) {
      const isProvinceCity = (customer.city === 'Huelva' || customer.city === 'Cádiz')
      if (isProvinceCity && customer.city !== customer.province) {
        problems.push(`city="${customer.city}" 與 province="${customer.province}" 不一致`)
      }
    }

    if (problems.length > 0) {
      issuesFound++
      issues.push({
        id: customer.id,
        name: customer.name,
        city: customer.city,
        province: customer.province,
        notes: customer.notes,
        problems
      })
    }
  })

  console.log(`\n📋 發現 ${issuesFound} 個客戶有數據問題:`)
  issues.forEach((issue, index) => {
    console.log(`\n${index + 1}. 客戶: ${issue.name} (ID: ${issue.id})`)
    console.log(`   City: ${issue.city}`)
    console.log(`   Province: ${issue.province}`)
    console.log(`   Notes: ${issue.notes?.substring(0, 100)}${issue.notes?.length > 100 ? '...' : ''}`)
    console.log(`   問題:`)
    issue.problems.forEach(problem => {
      console.log(`   - ${problem}`)
    })
  })

  return issues
}

async function fixCustomerData() {
  console.log('\n🔧 開始修復客戶數據...')
  
  const { data: customers, error } = await supabase
    .from('customers')
    .select('*')

  if (error) {
    console.error('❌ 無法載入客戶數據:', error)
    return
  }

  let fixedCount = 0
  
  for (const customer of customers) {
    const updates = {}
    let needsUpdate = false

    // 從 notes 中提取省份和城市資訊
    const notesProvince = extractProvinceFromNotes(customer.notes)
    const notesCity = extractCityFromNotes(customer.notes)

    // 修復 province 欄位
    if (!customer.province && notesProvince) {
      const normalizedProvince = normalizeProvince(notesProvince)
      if (normalizedProvince) {
        updates.province = normalizedProvince
        needsUpdate = true
        console.log(`✅ 設定 ${customer.name} 的 province: ${normalizedProvince}`)
      }
    }

    // 修復 city 欄位邏輯
    if (!customer.city) {
      // 如果沒有 city，優先使用 notes 中的城市，其次使用省份名稱
      if (notesCity) {
        const normalizedCity = normalizeCity(notesCity)
        if (normalizedCity) {
          updates.city = normalizedCity
          needsUpdate = true
          console.log(`✅ 設定 ${customer.name} 的 city: ${normalizedCity} (從 notes)`)
        }
      } else if (updates.province || customer.province) {
        // 如果沒有城市但有省份，且省份是 Huelva 或 Cádiz，則設定 city = province
        const province = updates.province || customer.province
        if (province === 'Huelva' || province === 'Cádiz') {
          updates.city = province
          needsUpdate = true
          console.log(`✅ 設定 ${customer.name} 的 city: ${province} (使用省份名稱)`)
        }
      }
    } else {
      // 如果有 city，確保它被正確標準化
      const normalizedCity = normalizeCity(customer.city)
      if (normalizedCity && normalizedCity !== customer.city) {
        updates.city = normalizedCity
        needsUpdate = true
        console.log(`✅ 標準化 ${customer.name} 的 city: ${customer.city} → ${normalizedCity}`)
      }
    }

    // 清理 notes
    if (customer.notes && (notesProvince || notesCity)) {
      const cleanedNotes = cleanNotes(customer.notes)
      if (cleanedNotes !== customer.notes) {
        updates.notes = cleanedNotes
        needsUpdate = true
        console.log(`✅ 清理 ${customer.name} 的 notes`)
      }
    }

    // 執行更新
    if (needsUpdate) {
      const { error: updateError } = await supabase
        .from('customers')
        .update(updates)
        .eq('id', customer.id)

      if (updateError) {
        console.error(`❌ 更新客戶 ${customer.name} 失敗:`, updateError)
      } else {
        fixedCount++
        console.log(`✅ 成功更新客戶 ${customer.name}`)
      }
    }
  }

  console.log(`\n🎉 修復完成！總共修復了 ${fixedCount} 個客戶記錄`)
}

async function main() {
  console.log('🚀 開始客戶數據分析和修復...\n')
  
  // 先分析問題
  await analyzeCustomerData()
  
  // 詢問是否要修復
  console.log('\n❓ 是否要執行數據修復？(請在代碼中設定 shouldFix = true)')
  
  // 設定這個變數為 true 來執行修復
  const shouldFix = false
  
  if (shouldFix) {
    await fixCustomerData()
    console.log('\n🔍 修復後重新分析...')
    await analyzeCustomerData()
  } else {
    console.log('\n💡 如要執行修復，請將 shouldFix 設定為 true 並重新執行腳本')
  }
}

main().catch(console.error)
