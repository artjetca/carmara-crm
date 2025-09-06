// Debug script to test frontend route operations directly
// Run this in browser console on the Visits page

async function debugRouteOperations() {
  console.log('🔍 Debug: Testing route operations...')
  
  // Check if we're on the visits page
  if (!window.location.pathname.includes('visits') && !window.location.pathname.includes('visitas')) {
    console.error('❌ Please run this on the Visits/Planificación page')
    return
  }
  
  // Test 1: Check Supabase connection
  console.log('\n1. Testing Supabase connection...')
  try {
    if (typeof supabase === 'undefined') {
      console.error('❌ Supabase client not found')
      return
    }
    
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      console.error('❌ User not authenticated:', error)
      return
    }
    
    console.log('✅ User authenticated:', user.email)
    
    // Test 2: Check if saved_routes table exists
    console.log('\n2. Testing saved_routes table...')
    const { data, error: tableError } = await supabase
      .from('saved_routes')
      .select('count(*)')
      .limit(1)
    
    if (tableError) {
      if (tableError.message.includes('relation "public.saved_routes" does not exist')) {
        console.error('❌ CRITICAL: saved_routes table does not exist in database!')
        console.error('👉 You must execute the SQL script in Supabase Dashboard first')
        return false
      } else {
        console.error('❌ Table access error:', tableError.message)
        return false
      }
    }
    
    console.log('✅ saved_routes table exists and accessible')
    
    // Test 3: Try to insert a test route
    console.log('\n3. Testing route insertion...')
    const testRoute = {
      name: 'Frontend Debug Test - ' + new Date().toISOString(),
      route_date: '2024-01-01',
      route_time: '10:00',
      customers: [{ id: 'test', name: 'Debug Customer' }],
      total_distance: 15.5,
      total_duration: 45,
      created_by: user.id
    }
    
    const { data: insertData, error: insertError } = await supabase
      .from('saved_routes')
      .insert([testRoute])
      .select()
    
    if (insertError) {
      console.error('❌ Insert failed:', insertError.message)
      return false
    }
    
    console.log('✅ Route inserted successfully:', insertData[0])
    const testRouteId = insertData[0].id
    
    // Test 4: Try to read routes
    console.log('\n4. Testing route reading...')
    const { data: routes, error: selectError } = await supabase
      .from('saved_routes')
      .select('*')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })
    
    if (selectError) {
      console.error('❌ Select failed:', selectError.message)
    } else {
      console.log(`✅ Found ${routes.length} routes:`)
      routes.forEach(route => {
        console.log(`  - ${route.name} (${route.id}) - ${route.created_at}`)
      })
    }
    
    // Test 5: Check localStorage vs database
    console.log('\n5. Comparing localStorage vs database...')
    const localRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]')
    console.log(`📱 localStorage routes: ${localRoutes.length}`)
    console.log(`🗄️ Database routes: ${routes.length}`)
    
    if (localRoutes.length > 0 && routes.length === 0) {
      console.warn('⚠️  Routes exist in localStorage but not in database')
      console.warn('💡 This means database operations are failing silently')
    }
    
    // Test 6: Clean up test route
    console.log('\n6. Cleaning up test route...')
    const { error: deleteError } = await supabase
      .from('saved_routes')
      .delete()
      .eq('id', testRouteId)
    
    if (deleteError) {
      console.error('❌ Delete failed:', deleteError.message)
    } else {
      console.log('✅ Test route cleaned up')
    }
    
    console.log('\n🎉 All database operations working correctly!')
    console.log('💡 If routes still not syncing, check frontend code or try hard refresh')
    
    return true
    
  } catch (error) {
    console.error('❌ Unexpected error:', error)
    return false
  }
}

// Comprehensive diagnosis
async function runComprehensiveDiagnosis() {
  console.log('🚀 Starting comprehensive route sync diagnosis...')
  console.log('=========================================')
  
  const dbWorking = await debugRouteOperations()
  
  if (dbWorking) {
    console.log('\n✅ Database operations are working!')
    console.log('🔍 Issue might be in frontend code or user interaction')
    console.log('\nNext steps:')
    console.log('1. Try saving a route in the UI')
    console.log('2. Check browser console for errors')
    console.log('3. Verify user is logged in')
    console.log('4. Try hard refresh (Cmd+Shift+R)')
  } else {
    console.log('\n❌ Database operations failed!')
    console.log('🛠️  Required actions:')
    console.log('1. Execute SQL script in Supabase Dashboard')
    console.log('2. Ensure saved_routes table exists')
    console.log('3. Check RLS policies are set correctly')
  }
  
  console.log('\n📋 Copy this console output to share with developer')
}

// Auto-run the diagnosis
console.log('Frontend Route Debug Tool loaded. Run: runComprehensiveDiagnosis()')
