const { createClient } = require('@supabase/supabase-js')

// 从环境变量获取配置
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://aotpcnwjjpkzxnhvmcvb.supabase.co'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY

if (!supabaseKey) {
  console.error('❌ Missing Supabase service role key environment variable')
  console.error('Please set SUPABASE_SERVICE_ROLE_KEY in your environment')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// 模拟前端的displayProvince函数
const isProvinceName = (v) => {
  const s = String(v || '').trim().toLowerCase()
  return s === 'huelva' || s === 'cádiz' || s === 'cadiz'
}

const displayProvince = (customer) => {
  if (!customer) return ''
  try {
    // 优先使用数据表中的province字段
    if (customer.province && String(customer.province).trim().length > 0) {
      return String(customer.province).trim()
    }
    // 从notes中解析省份
    if (customer.notes) {
      const m = customer.notes.match(/Provincia:\s*([^\n]+)/i)
      if (m) return m[1].trim()
    }
    // 最后才检查city是否为省份名称
    if (customer.city && isProvinceName(customer.city)) return customer.city
    return ''
  } catch (error) {
    console.error('[DISPLAY_PROVINCE] Error processing customer:', customer, error)
    return ''
  }
}

const displayCity = (customer) => {
  if (!customer) return ''
  try {
    // 从notes中解析城市
    if (customer.notes) {
      const m = customer.notes.match(/Ciudad:\s*([^\n]+)/i)
      if (m) return m[1].trim()
    }
    const city = String(customer.city || '').trim()
    if (city && !isProvinceName(city)) return city
    return ''
  } catch (error) {
    console.error('[DISPLAY_CITY] Error processing customer:', customer, error)
    return ''
  }
}

async function debugProvinceFiltering() {
  console.log('🔍 Debugging province filtering logic...')
  
  try {
    // 获取所有客户数据
    const { data: customers, error } = await supabase
      .from('customers')
      .select('*')
      
    if (error) {
      console.error('❌ Error fetching customers:', error)
      process.exit(1)
    }
    
    console.log(`\n📊 Total customers: ${customers.length}`)
    
    // 分析每个客户的province和city显示逻辑
    let huelvaProvinceCount = 0
    let cadizProvinceCount = 0
    let huelvaCustomers = []
    let cadizCustomers = []
    let noProvinceCustomers = []
    
    customers.forEach(customer => {
      const resolvedProvince = displayProvince(customer)
      const resolvedCity = displayCity(customer)
      
      const customerInfo = {
        id: customer.id,
        name: customer.name,
        rawCity: customer.city,
        rawProvince: customer.province,
        resolvedCity: resolvedCity,
        resolvedProvince: resolvedProvince,
        notes: customer.notes ? customer.notes.substring(0, 100) + '...' : null
      }
      
      if (resolvedProvince === 'Huelva') {
        huelvaProvinceCount++
        huelvaCustomers.push(customerInfo)
      } else if (resolvedProvince === 'Cádiz') {
        cadizProvinceCount++
        cadizCustomers.push(customerInfo)
      } else {
        noProvinceCustomers.push(customerInfo)
      }
    })
    
    console.log(`\n🗺️ Province distribution:`)
    console.log(`   Huelva: ${huelvaProvinceCount} customers`)
    console.log(`   Cádiz: ${cadizProvinceCount} customers`)
    console.log(`   No province: ${noProvinceCustomers.length} customers`)
    
    console.log(`\n📋 Huelva customers:`)
    huelvaCustomers.slice(0, 5).forEach(c => {
      console.log(`   - ${c.name}: city="${c.rawCity}" province="${c.rawProvince}" → resolved: "${c.resolvedCity}", "${c.resolvedProvince}"`)
    })
    if (huelvaCustomers.length > 5) {
      console.log(`   ... and ${huelvaCustomers.length - 5} more`)
    }
    
    console.log(`\n📋 Cádiz customers:`)
    cadizCustomers.slice(0, 5).forEach(c => {
      console.log(`   - ${c.name}: city="${c.rawCity}" province="${c.rawProvince}" → resolved: "${c.resolvedCity}", "${c.resolvedProvince}"`)
    })
    if (cadizCustomers.length > 5) {
      console.log(`   ... and ${cadizCustomers.length - 5} more`)
    }
    
    console.log(`\n📋 Customers without province:`)
    noProvinceCustomers.slice(0, 5).forEach(c => {
      console.log(`   - ${c.name}: city="${c.rawCity}" province="${c.rawProvince}" → resolved: "${c.resolvedCity}", "${c.resolvedProvince}"`)
    })
    if (noProvinceCustomers.length > 5) {
      console.log(`   ... and ${noProvinceCustomers.length - 5} more`)
    }
    
    // 测试筛选逻辑
    console.log(`\n🔍 Testing filtering logic:`)
    
    // 模拟选择"Huelva"省份时的筛选
    const huelvaFiltered = customers.filter(customer => {
      const customerProvince = displayProvince(customer)
      return customerProvince === 'Huelva'
    })
    console.log(`   When filtering by "Huelva": ${huelvaFiltered.length} customers found`)
    
    // 模拟选择"Cádiz"省份时的筛选
    const cadizFiltered = customers.filter(customer => {
      const customerProvince = displayProvince(customer)
      return customerProvince === 'Cádiz'
    })
    console.log(`   When filtering by "Cádiz": ${cadizFiltered.length} customers found`)
    
    // 检查是否有city为"Huelva"但province不是"Huelva"的客户
    const inconsistentHuelva = customers.filter(customer => {
      return customer.city === 'Huelva' && customer.province !== 'Huelva'
    })
    
    if (inconsistentHuelva.length > 0) {
      console.log(`\n⚠️ Found ${inconsistentHuelva.length} customers with city="Huelva" but province!="Huelva":`)
      inconsistentHuelva.forEach(c => {
        console.log(`   - ${c.name}: city="${c.city}" province="${c.province}"`)
      })
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

debugProvinceFiltering()
