import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project.supabase.co'
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'your-anon-key'

const supabase = createClient(supabaseUrl, supabaseKey)

async function testSavedRoutesTable() {
  console.log('Testing saved_routes table...')
  
  try {
    // Test 1: Check if table exists by trying to select from it
    console.log('\n1. Testing table existence...')
    const { data: tableTest, error: tableError } = await supabase
      .from('saved_routes')
      .select('count(*)')
      .limit(1)
    
    if (tableError) {
      console.error('❌ Table does not exist or has permission issues:', tableError.message)
      return false
    } else {
      console.log('✅ saved_routes table exists')
    }
    
    // Test 2: Check current user authentication
    console.log('\n2. Testing authentication...')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      console.log('❌ No authenticated user found')
      console.log('This test requires a logged-in user to work properly')
      return false
    } else {
      console.log('✅ User authenticated:', user.email)
    }
    
    // Test 3: Try to insert a test route
    console.log('\n3. Testing route insertion...')
    const testRoute = {
      name: 'Test Route - ' + new Date().toISOString(),
      route_date: '2024-01-01',
      route_time: '10:00',
      customers: [{ id: 'test', name: 'Test Customer' }],
      total_distance: 10.5,
      total_duration: 30,
      created_by: user.id
    }
    
    const { data: insertData, error: insertError } = await supabase
      .from('saved_routes')
      .insert([testRoute])
      .select()
    
    if (insertError) {
      console.error('❌ Insert failed:', insertError.message)
      return false
    } else {
      console.log('✅ Route inserted successfully:', insertData[0].id)
    }
    
    // Test 4: Try to read the inserted route
    console.log('\n4. Testing route selection...')
    const { data: selectData, error: selectError } = await supabase
      .from('saved_routes')
      .select('*')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })
      .limit(5)
    
    if (selectError) {
      console.error('❌ Select failed:', selectError.message)
      return false
    } else {
      console.log('✅ Routes retrieved:', selectData.length)
      selectData.forEach(route => {
        console.log(`  - ${route.name} (${route.id})`)
      })
    }
    
    // Test 5: Clean up - delete test route
    if (insertData && insertData[0]) {
      console.log('\n5. Cleaning up test data...')
      const { error: deleteError } = await supabase
        .from('saved_routes')
        .delete()
        .eq('id', insertData[0].id)
      
      if (deleteError) {
        console.error('❌ Cleanup failed:', deleteError.message)
      } else {
        console.log('✅ Test route cleaned up')
      }
    }
    
    console.log('\n🎉 All tests passed! saved_routes table is working correctly.')
    return true
    
  } catch (error) {
    console.error('❌ Unexpected error:', error)
    return false
  }
}

// Run the test
testSavedRoutesTable().then(success => {
  process.exit(success ? 0 : 1)
})
