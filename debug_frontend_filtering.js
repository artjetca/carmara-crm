// 模拟前端的筛选逻辑来调试问题
console.log('🔍 Debugging frontend filtering logic...')

// 模拟客户数据（基于之前看到的数据结构）
const mockCustomers = [
  {
    id: '1',
    name: 'Cliente Huelva 1',
    city: 'Huelva',
    province: 'Huelva',
    notes: 'Cliente en Huelva'
  },
  {
    id: '2', 
    name: 'Cliente Huelva 2',
    city: 'Huelva',
    province: null, // 这种情况可能导致筛选问题
    notes: 'Provincia: Huelva'
  },
  {
    id: '3',
    name: 'Cliente Cádiz 1', 
    city: 'Cádiz',
    province: 'Cádiz',
    notes: 'Cliente en Cádiz'
  },
  {
    id: '4',
    name: 'Cliente sin provincia',
    city: 'Sevilla',
    province: null,
    notes: 'Cliente en otra ciudad'
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

// 测试每个客户的省份解析
console.log('\n📊 Testing province resolution for each customer:')
mockCustomers.forEach(customer => {
  const resolvedProvince = displayProvince(customer)
  console.log(`${customer.name}:`)
  console.log(`  Raw data: city="${customer.city}", province="${customer.province}"`)
  console.log(`  Resolved province: "${resolvedProvince}"`)
  console.log(`  Notes: "${customer.notes}"`)
  console.log('')
})

// 测试筛选逻辑
console.log('🔍 Testing filtering logic:')

const testFilter = (selectedProvince) => {
  console.log(`\nFiltering by province: "${selectedProvince}"`)
  
  const filtered = mockCustomers.filter(customer => {
    if (!customer) return false
    
    // 如果没有选择省份或选择的是空字符串，显示所有客户
    if (!selectedProvince || selectedProvince === '') {
      return true
    }
    
    // 检查省份是否匹配
    const customerProvince = displayProvince(customer)
    const matchesProvince = customerProvince === selectedProvince
    
    console.log(`  ${customer.name}: customerProvince="${customerProvince}", matches=${matchesProvince}`)
    
    return matchesProvince
  })
  
  console.log(`  Result: ${filtered.length} customers found`)
  filtered.forEach(c => console.log(`    - ${c.name}`))
}

// 测试不同的筛选条件
testFilter('') // 显示所有
testFilter('Huelva') // 只显示Huelva
testFilter('Cádiz') // 只显示Cádiz

console.log('\n✅ Frontend filtering logic test completed')

// 检查可能的问题
console.log('\n⚠️ Potential issues to check:')
console.log('1. 确保数据库中的province字段已正确填充')
console.log('2. 检查前端是否正确调用displayProvince函数')
console.log('3. 验证筛选条件的大小写匹配')
console.log('4. 确认客户数据加载是否成功')
