// 测试前端筛选逻辑的完整性
console.log('🧪 Testing filtering logic for customer city and province display...')

// 模拟真实的客户数据场景
const testCustomers = [
  {
    id: '1',
    name: 'Cliente Huelva Capital',
    city: 'Huelva',
    province: 'Huelva',
    notes: 'Cliente en capital de provincia'
  },
  {
    id: '2', 
    name: 'Cliente Huelva sin Province',
    city: 'Huelva',
    province: null,
    notes: 'Provincia: Huelva'
  },
  {
    id: '3',
    name: 'Cliente Bonares',
    city: 'Bonares',
    province: 'Huelva', 
    notes: 'Ciudad: Bonares'
  },
  {
    id: '4',
    name: 'Cliente Cádiz Capital',
    city: 'Cádiz',
    province: 'Cádiz',
    notes: 'Cliente en capital'
  },
  {
    id: '5',
    name: 'Cliente Jerez',
    city: 'Jerez de la Frontera',
    province: 'Cádiz',
    notes: 'Ciudad: Jerez de la Frontera'
  },
  {
    id: '6',
    name: 'Cliente sin datos completos',
    city: 'Sevilla',
    province: null,
    notes: 'Cliente en otra provincia'
  }
]

// 复制前端的筛选逻辑
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
    // 如果city字段不是省份名称，则显示city
    const city = String(customer.city || '').trim()
    if (city && !isProvinceName(city)) return city
    return ''
  } catch (error) {
    console.error('[DISPLAY_CITY] Error processing customer:', customer, error)
    return ''
  }
}

// 测试每个客户的解析结果
console.log('\n📊 Customer data analysis:')
testCustomers.forEach(customer => {
  const resolvedProvince = displayProvince(customer)
  const resolvedCity = displayCity(customer)
  
  console.log(`\n${customer.name}:`)
  console.log(`  Raw data: city="${customer.city}", province="${customer.province}"`)
  console.log(`  Resolved: city="${resolvedCity}", province="${resolvedProvince}"`)
  console.log(`  Notes: "${customer.notes}"`)
})

// 测试筛选功能
console.log('\n🔍 Testing filtering functionality:')

const testProvinceFilter = (selectedProvince) => {
  console.log(`\n--- Filtering by province: "${selectedProvince}" ---`)
  
  const filtered = testCustomers.filter(customer => {
    // 如果没有选择省份，显示所有客户
    if (!selectedProvince || selectedProvince === '') {
      return true
    }
    
    // 检查省份是否匹配
    const customerProvince = displayProvince(customer)
    const matches = customerProvince === selectedProvince
    
    console.log(`  ${customer.name}: province="${customerProvince}" → ${matches ? '✓' : '✗'}`)
    
    return matches
  })
  
  console.log(`  📋 Result: ${filtered.length} customers found`)
  if (filtered.length > 0) {
    filtered.forEach(c => console.log(`    - ${c.name}`))
  }
}

// 测试不同的筛选条件
testProvinceFilter('') // 显示所有
testProvinceFilter('Huelva') // 只显示Huelva
testProvinceFilter('Cádiz') // 只显示Cádiz

// 验证地图页面和客户页面的一致性
console.log('\n🗺️ Map page vs Customer page consistency check:')

// 模拟地图页面的筛选
const mapPageFilter = (customers, selectedProvince) => {
  return customers.filter(customer => {
    if (!selectedProvince || selectedProvince === '') {
      return true
    }
    const customerProvince = displayProvince(customer)
    return customerProvince === selectedProvince
  })
}

// 模拟客户页面的筛选
const customerPageFilter = (customers, selectedCity) => {
  return customers.filter(customer => {
    // 使用省份筛选逻辑而不是城市筛选
    const matchesProvince = !selectedCity || displayProvince(customer) === selectedCity
    return matchesProvince
  })
}

// 比较两个页面的筛选结果
const testConsistency = (province) => {
  const mapResults = mapPageFilter(testCustomers, province)
  const customerResults = customerPageFilter(testCustomers, province)
  
  const consistent = mapResults.length === customerResults.length && 
    mapResults.every(c => customerResults.find(cr => cr.id === c.id))
  
  console.log(`Province "${province}": Map(${mapResults.length}) vs Customer(${customerResults.length}) → ${consistent ? '✓ Consistent' : '✗ Inconsistent'}`)
}

testConsistency('Huelva')
testConsistency('Cádiz')
testConsistency('')

console.log('\n✅ Filtering logic test completed!')

// 总结发现的问题
console.log('\n📝 Summary of potential issues:')
console.log('1. 确保数据库中province字段已正确填充')
console.log('2. 验证前端筛选逻辑在地图页面和客户页面保持一致')
console.log('3. 检查客户数据中city和province字段的数据质量')
console.log('4. 确认displayProvince和displayCity函数正确处理各种数据情况')
