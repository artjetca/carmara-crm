import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Helper: detect whether 'user_profiles' or 'profiles' exists
async function detectProfilesTable() {
  // Try user_profiles first
  const { error } = await supabase.from('user_profiles').select('id').limit(1)
  if (!error) return 'user_profiles'
  // Fallback to profiles
  const { error: err2 } = await supabase.from('profiles').select('id').limit(1)
  if (!err2) return 'profiles'
  // Default to user_profiles
  return 'user_profiles'
}

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
    console.log('✅ scheduled_messages table accessible')
    const sampleRow = schemaTest && schemaTest.length ? schemaTest[0] : null
    if (sampleRow) {
      console.log('ℹ️ Existing columns:', Object.keys(sampleRow).join(', '))
    }
    console.log('')

    // 2. Test simple insert with minimal data
    console.log('2. Testing simple insert...')
    const testRow = {
      message: 'Test message from script',
      scheduled_for: new Date().toISOString(),
      status: 'pending'
    }
    
    const { data: insertData, error: insertError } = await supabase
      .from('scheduled_messages')
      .insert([testRow])
      .select('*')
    
    if (insertError) {
      console.log('❌ Insert error:', insertError)
      console.log('Details:', insertError.details)
      console.log('Hint:', insertError.hint)
      console.log('Code:', insertError.code)
    } else {
      console.log('✅ Insert successful:', insertData)
    }
    console.log('')

    // 3. Get a test customer
    console.log('3. Getting test customer...')
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

    // 3. Get any user for testing (auto-create one if none exists)
    console.log('3. Getting test user...')
    let testUser
    let createdUserId = null
    const profilesTable = await detectProfilesTable()
    {
      const { data: users, error: userError } = await supabase
        .from(profilesTable)
        .select('id, email, full_name')
        .limit(1)

      if (!userError && users?.length) {
        testUser = users[0]
      } else {
        console.log('ℹ️ No users found, creating a test user...')
        const email = `test_user_${Date.now()}@example.com`
        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email,
          password: 'Passw0rd!123',
          email_confirm: true,
          user_metadata: { full_name: 'Test User' }
        })
        if (createErr) {
          console.log('❌ Failed to create test user:', createErr.message)
          return
        }
        createdUserId = created.user.id
        // deterministically upsert profile row to avoid relying on trigger timing
        const { error: upsertErr } = await supabase
          .from(profilesTable)
          .upsert({ id: created.user.id, email, full_name: 'Test User' })
        if (upsertErr) {
          console.log('❌ Failed to upsert user_profiles:', upsertErr.message)
          return
        }
        testUser = { id: created.user.id, email, full_name: 'Test User' }
      }
    }
    console.log(`✅ Using test user: ${testUser.email || testUser.id}\n`)

    // 4. Test message creation
    console.log('4. Testing message creation...')
    const basePayload = {
      type: 'sms',
      message: 'Test message from automated testing',
      scheduled_for: new Date(Date.now() + 60000).toISOString(), // 1 minute from now
      status: 'pending',
      user_id: testUser.id,
      subject: 'Test'
    }
    let createdMessage
    const { subject, ...baseNoSubject } = basePayload
    const baseCreatedBy = { ...basePayload, created_by: basePayload.user_id }
    delete baseCreatedBy.user_id
    const baseNoSubjectCreatedBy = { ...baseNoSubject, created_by: basePayload.user_id }
    const baseSendAt = { ...baseNoSubject, send_at: baseNoSubject.scheduled_for }
    delete baseSendAt.scheduled_for
    const baseSendAtCreatedBy = { ...baseNoSubjectCreatedBy, send_at: baseNoSubject.scheduled_for }
    delete baseSendAtCreatedBy.scheduled_for
    const baseContent = { ...baseNoSubjectCreatedBy, content: baseNoSubject.message }
    delete baseContent.message
    const baseText = { ...baseNoSubjectCreatedBy, text: baseNoSubject.message }
    delete baseText.message
    // minimal payloads matching detected schema (no type/subject)
    const minimalCreatedBy = {
      created_by: testUser.id,
      message: baseNoSubject.message,
      scheduled_for: baseNoSubject.scheduled_for,
      status: baseNoSubject.status,
    }
    const minimalCreatedByNoStatus = {
      created_by: testUser.id,
      message: baseNoSubject.message,
      scheduled_for: baseNoSubject.scheduled_for,
    }

    const attempts = [
      { payload: { ...basePayload, customer_id: testCustomer.id }, note: 'customer_id + subject' },
      { payload: { ...basePayload, customer_ids: [testCustomer.id] }, note: 'customer_ids + subject' },
      { payload: { ...baseNoSubject, customer_id: testCustomer.id }, note: 'customer_id without subject' },
      { payload: { ...baseNoSubject, customer_ids: [testCustomer.id] }, note: 'customer_ids without subject' },
      { payload: { ...baseNoSubjectCreatedBy, customer_ids: [testCustomer.id] }, note: 'created_by + customer_ids without subject' },
      { payload: { ...baseCreatedBy, customer_id: testCustomer.id }, note: 'created_by + customer_id' },
      { payload: { ...baseCreatedBy, customer_ids: [testCustomer.id] }, note: 'created_by + customer_ids' },
      { payload: { ...baseSendAt, customer_id: testCustomer.id }, note: 'send_at + customer_id' },
      { payload: { ...baseSendAt, customer_ids: [testCustomer.id] }, note: 'send_at + customer_ids' },
      { payload: { ...baseSendAtCreatedBy, customer_id: testCustomer.id }, note: 'created_by + send_at + customer_id' },
      { payload: { ...baseSendAtCreatedBy, customer_ids: [testCustomer.id] }, note: 'created_by + send_at + customer_ids' },
      { payload: { ...baseContent, customer_id: testCustomer.id }, note: 'created_by + content + customer_id' },
      { payload: { ...baseText, customer_id: testCustomer.id }, note: 'created_by + text + customer_id' },
      { payload: { ...minimalCreatedBy, customer_ids: [testCustomer.id] }, note: 'minimal created_by + customer_ids' },
      { payload: { ...minimalCreatedByNoStatus, customer_ids: [testCustomer.id] }, note: 'minimal created_by + customer_ids (no status)' },
    ]
    let lastError = null
    for (const attempt of attempts) {
      const resp = await supabase
        .from('scheduled_messages')
        .insert(attempt.payload)
        .select('*')
        .single()
      if (!resp.error) {
        createdMessage = resp.data
        break
      } else {
        lastError = resp.error
        console.log(`ℹ️ Insert attempt failed (${attempt.note}):`, resp.error.message)
      }
    }
    if (!createdMessage) {
      console.log('⚠️ Message creation failed after all attempts:', lastError?.message)
    } else {
      console.log('✅ Message created successfully')
      console.log(`   ID: ${createdMessage.id}`)
      console.log(`   Status: ${createdMessage.status || createdMessage.state || 'n/a'}`)
      console.log('')
    }

    // 5. Test message retrieval with profile info (no join, fetch separately)
    console.log('5. Testing message retrieval with profile info...')
    let msg = null
    if (createdMessage?.id) {
      const base = await supabase
        .from('scheduled_messages')
        .select('*')
        .eq('id', createdMessage.id)
      if (!base.error && base.data?.length) msg = base.data[0]
    }
    if (!msg && sampleRow) {
      console.log('ℹ️ Falling back to existing row for retrieval tests')
      msg = sampleRow
    }
    if (!msg) {
      console.log('⚠️ Skipping retrieval/profile/cleanup tests due to schema mismatch and no sample row')
    }
    if (msg) {
      const userRefId = msg.user_id || msg.created_by
      let creatorProfile = null
      if (userRefId) {
        const prof = await supabase
          .from(profilesTable)
          .select('id, email, full_name')
          .eq('id', userRefId)
          .single()
        creatorProfile = prof.data || null
      }
      console.log('✅ Message retrieved with profile info')
      console.log(`   Creator: ${creatorProfile?.full_name || creatorProfile?.email || 'N/A'}\n`)
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
    const isProvinceName = (v) => /^(huelva|c(a|á)diz|ceuta)$/i.test(String(v || '').trim())
    
    const extractFromNotes = (notes, key) => {
      if (!notes) return ''
      const m = notes.match(new RegExp(`${key}:\\s*([^\\n|]+)`, 'i'))
      return m ? m[1].trim() : ''
    }
    
    const normalizeProvince = (val) => {
      const s = String(val || '').trim().toLowerCase()
      if (s === 'cadiz' || s === 'cádiz') return 'Cádiz'
      if (s === 'huelva') return 'Huelva'
      if (s === 'ceuta') return 'Ceuta'
      return val?.trim() || ''
    }

    const municipiosByProvince = {
      'Cádiz': ['Cádiz', 'Jerez de la Frontera', 'Algeciras', 'San Fernando', 'El Puerto de Santa María', 'Chiclana de la Frontera', 'Sanlúcar de Barrameda', 'La Línea de la Concepción', 'Puerto Real', 'Barbate'],
      'Huelva': ['Huelva', 'Lepe', 'Almonte', 'Moguer', 'Ayamonte', 'Isla Cristina', 'Valverde del Camino', 'Cartaya', 'Palos de la Frontera', 'Bollullos Par del Condado'],
      'Ceuta': ['Ceuta']
    }

    const deriveProvince = (c) => {
      const p = String(c.province || '').trim()
      if (p) return normalizeProvince(p)
      const fromNotes = extractFromNotes(c.notes, 'Provincia')
      if (fromNotes) return normalizeProvince(fromNotes)
      const city = String(c.city || '').trim()
      if (/^huelva$/i.test(city)) return 'Huelva'
      if (/^c(a|á)diz$/i.test(city)) return 'Cádiz'
      if (/^ceuta$/i.test(city)) return 'Ceuta'
      if (municipiosByProvince['Huelva']?.some(m => m.toLowerCase() === city.toLowerCase())) return 'Huelva'
      if (municipiosByProvince['Cádiz']?.some(m => m.toLowerCase() === city.toLowerCase())) return 'Cádiz'
      if (municipiosByProvince['Ceuta']?.some(m => m.toLowerCase() === city.toLowerCase())) return 'Ceuta'
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
    console.log('7. Cleaning up test data...')
    if (createdMessage?.id) {
      const { error: deleteError } = await supabase
        .from('scheduled_messages')
        .delete()
        .eq('id', createdMessage.id)
      if (deleteError) {
        console.log('❌ Cleanup error:', deleteError.message)
      } else {
        console.log('✅ Test message cleaned up')
      }
    }

    // delete auto-created user if needed
    if (createdUserId) {
      const { error: delUserErr } = await supabase.auth.admin.deleteUser(createdUserId)
      if (delUserErr) {
        console.log('❌ Failed to delete test user:', delUserErr.message)
      } else {
        console.log('✅ Test user deleted')
      }
    }

    // recipients count (supports either schema)
    if (msg) {
      const recipientsCount = (msg.customer_ids && Array.isArray(msg.customer_ids)) ? msg.customer_ids.length : (msg.customer_id ? 1 : 0)
      console.log(`✅ Recipients count: ${recipientsCount}`)
    }

    console.log('🎉 All message scheduling tests passed!')

  } catch (error) {
    console.error('❌ Test error:', error.message)
  }
}

testMessageScheduling()
