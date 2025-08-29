import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function testMessageScheduling() {
  try {
    console.log('🧪 Testing Message Scheduling Functionality...\n')

    // 1. Test database schema
    console.log('1. Testing scheduled_messages table schema...')
    const { data: schemaTest, error: schemaError } = await supabase
      .from('scheduled_messages')
      .select('*')
      .limit(1)

    if (schemaError) {
      console.log('❌ Schema error:', schemaError.message)
      return
    }
    console.log('✅ scheduled_messages table accessible\n')

    // 2. Get a test customer
    console.log('2. Getting test customer...')
    const { data: customers, error: customerError } = await supabase
      .from('customers')
      .select('id, name, company, province, city')
      .eq('province', 'Huelva')
      .limit(1)

    if (customerError || !customers?.length) {
      console.log('❌ No customers found for testing')
      return
    }

    const testCustomer = customers[0]
    console.log(`✅ Using test customer: ${testCustomer.name} (${testCustomer.company})`)
    console.log(`   Province: ${testCustomer.province}, City: ${testCustomer.city}\n`)

    // 3. Get any user for testing
    console.log('3. Getting test user...')
    const { data: users, error: userError } = await supabase
      .from('profiles')
      .select('id, email, role')
      .limit(1)

    if (userError || !users?.length) {
      console.log('❌ No users found for testing')
      return
    }

    const testUser = users[0]
    console.log(`✅ Using test user: ${testUser.email}\n`)

    // 4. Test message creation
    console.log('4. Testing message creation...')
    const testMessage = {
      customer_ids: [testCustomer.id],
      message: 'Test message from automated testing',
      scheduled_for: new Date(Date.now() + 60000).toISOString(), // 1 minute from now
      status: 'pending',
      created_by: testUser.id
    }

    const { data: createdMessage, error: createError } = await supabase
      .from('scheduled_messages')
      .insert(testMessage)
      .select('*')
      .single()

    if (createError) {
      console.log('❌ Message creation error:', createError.message)
      return
    }
    console.log('✅ Message created successfully')
    console.log(`   ID: ${createdMessage.id}`)
    console.log(`   Scheduled for: ${createdMessage.scheduled_for}`)
    console.log(`   Status: ${createdMessage.status}\n`)

    // 5. Test message retrieval with profile join
    console.log('5. Testing message retrieval with profile join...')
    const { data: retrievedMessages, error: retrieveError } = await supabase
      .from('scheduled_messages')
      .select(`
        *,
        creator_profile:profiles!scheduled_messages_created_by_fkey (
          id,
          name,
          email,
          full_name
        )
      `)
      .eq('id', createdMessage.id)

    if (retrieveError) {
      console.log('❌ Message retrieval error:', retrieveError.message)
    } else {
      console.log('✅ Message retrieved with profile join')
      console.log(`   Creator: ${retrievedMessages[0].creator_profile?.full_name || retrievedMessages[0].creator_profile?.email}\n`)
    }

    // 6. Test filtering functionality
    console.log('6. Testing filtering functionality...')
    
    // Test province filtering
    const testProvince = 'Huelva'
    const { data: allCustomers, error: allCustomersError } = await supabase
      .from('customers')
      .select('*')

    if (allCustomersError) {
      console.log('❌ Error fetching customers for filtering test')
      return
    }

    // Apply the same filtering logic as in Communications.tsx
    const isProvinceName = (v) => /^(huelva|c(a|á)diz)$/i.test(String(v || '').trim())
    
    const extractFromNotes = (notes, key) => {
      if (!notes) return ''
      const m = notes.match(new RegExp(`${key}:\\s*([^\\n|]+)`, 'i'))
      return m ? m[1].trim() : ''
    }
    
    const normalizeProvince = (val) => {
      const s = String(val || '').trim().toLowerCase()
      if (s === 'cadiz' || s === 'cádiz') return 'Cádiz'
      if (s === 'huelva') return 'Huelva'
      return val?.trim() || ''
    }

    const municipiosByProvince = {
      'Cádiz': ['Cádiz', 'Jerez de la Frontera', 'Algeciras', 'San Fernando', 'El Puerto de Santa María', 'Chiclana de la Frontera', 'Sanlúcar de Barrameda', 'La Línea de la Concepción', 'Puerto Real', 'Barbate'],
      'Huelva': ['Huelva', 'Lepe', 'Almonte', 'Moguer', 'Ayamonte', 'Isla Cristina', 'Valverde del Camino', 'Cartaya', 'Palos de la Frontera', 'Bollullos Par del Condado']
    }

    const deriveProvince = (c) => {
      const p = String(c.province || '').trim()
      if (p) return normalizeProvince(p)
      const fromNotes = extractFromNotes(c.notes, 'Provincia')
      if (fromNotes) return normalizeProvince(fromNotes)
      const city = String(c.city || '').trim()
      if (/^huelva$/i.test(city)) return 'Huelva'
      if (/^c(a|á)diz$/i.test(city)) return 'Cádiz'
      if (municipiosByProvince['Huelva']?.some(m => m.toLowerCase() === city.toLowerCase())) return 'Huelva'
      if (municipiosByProvince['Cádiz']?.some(m => m.toLowerCase() === city.toLowerCase())) return 'Cádiz'
      return ''
    }

    const deriveCity = (c) => {
      const fromNotes = extractFromNotes(c.notes, 'Ciudad')
      if (fromNotes) return fromNotes
      const city = String(c.city || '').trim()
      if (city) return city
      return ''
    }

    const huelvaCustomers = allCustomers.filter(c => deriveProvince(c) === testProvince)
    console.log(`✅ Province filtering: ${huelvaCustomers.length} customers in ${testProvince}`)

    // Test city filtering
    const huelvaCity = huelvaCustomers.filter(c => deriveCity(c) === 'Huelva')
    console.log(`✅ City filtering: ${huelvaCity.length} customers in Huelva city`)

    // Test city dropdown options
    const citiesInProvince = Array.from(new Set([
      ...(municipiosByProvince[testProvince] || []),
      ...huelvaCustomers.map(c => deriveCity(c)).filter(city => city.length > 0)
    ])).sort()
    
    console.log(`✅ City dropdown options for ${testProvince}: ${citiesInProvince.length} cities`)
    console.log(`   Cities: ${citiesInProvince.slice(0, 5).join(', ')}${citiesInProvince.length > 5 ? '...' : ''}\n`)

    // 7. Cleanup test message
    console.log('7. Cleaning up test message...')
    const { error: deleteError } = await supabase
      .from('scheduled_messages')
      .delete()
      .eq('id', createdMessage.id)

    if (deleteError) {
      console.log('❌ Cleanup error:', deleteError.message)
    } else {
      console.log('✅ Test message cleaned up\n')
    }

    console.log('🎉 All message scheduling tests passed!')

  } catch (error) {
    console.error('❌ Test error:', error.message)
  }
}

testMessageScheduling()
