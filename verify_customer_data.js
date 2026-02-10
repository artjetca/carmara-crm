import { createClient } from '@supabase/supabase-js'

// Supabase配置
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function verifyCustomerData() {
  console.log('🔍 Verifying customer data consistency...')
  
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
    
    // 统计各种情况
    let cityCadizCount = 0
    let cityHuelvaCount = 0
    let provinceCadizCount = 0
    let provinceHuelvaCount = 0
    let inconsistentData = []
    
    customers.forEach(customer => {
      // 统计city字段
      if (customer.city === 'Cádiz') cityCadizCount++
      if (customer.city === 'Huelva') cityHuelvaCount++
      
      // 统计province字段
      if (customer.province === 'Cádiz') provinceCadizCount++
      if (customer.province === 'Huelva') provinceHuelvaCount++
      
      // 检查不一致的数据
      if (customer.city === 'Huelva' && (!customer.province || customer.province !== 'Huelva')) {
        inconsistentData.push({
          id: customer.id,
          name: customer.name,
          city: customer.city,
          province: customer.province || 'NULL'
        })
      }
      
      if (customer.city === 'Cádiz' && (!customer.province || customer.province !== 'Cádiz')) {
        inconsistentData.push({
          id: customer.id,
          name: customer.name,
          city: customer.city,
          province: customer.province || 'NULL'
        })
      }
    })
    
    console.log(`\n🏙️ City statistics:`)
    console.log(`   Cádiz: ${cityCadizCount}`)
    console.log(`   Huelva: ${cityHuelvaCount}`)
    
    console.log(`\n🗺️ Province statistics:`)
    console.log(`   Cádiz: ${provinceCadizCount}`)
    console.log(`   Huelva: ${provinceHuelvaCount}`)
    
    console.log(`\n⚠️ Inconsistent data (city without matching province): ${inconsistentData.length}`)
    if (inconsistentData.length > 0) {
      console.log('\n📋 Inconsistent customers:')
      inconsistentData.forEach(customer => {
        console.log(`   ID: ${customer.id}, Name: ${customer.name}, City: ${customer.city}, Province: ${customer.province}`)
      })
    } else {
      console.log('\n✅ All customer data is consistent!')
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

verifyCustomerData()
