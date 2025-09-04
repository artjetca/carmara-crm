const { createClient } = require('@supabase/supabase-js')

async function checkPendingVisits() {
  // You'll need to set your environment variables
  const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://aotpcnwjjpkzxnhvmcvb.supabase.co'
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
  
  if (!supabaseKey) {
    console.log('❌ Missing VITE_SUPABASE_ANON_KEY')
    return
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  
  try {
    // Check all visits in the database
    const { data: allVisits, error } = await supabase
      .from('visits')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) {
      console.log('❌ Error fetching visits:', error.message)
      return
    }
    
    console.log('📊 Total visits in database:', allVisits?.length || 0)
    
    // Filter pending visits
    const pendingVisits = (allVisits || []).filter(visit => 
      visit.status === 'pending' || visit.status === 'programada'
    )
    
    console.log('⏳ Pending visits:', pendingVisits.length)
    
    if (pendingVisits.length > 0) {
      console.log('📋 Pending visit details:')
      pendingVisits.forEach(visit => {
        console.log({
          id: visit.id,
          status: visit.status,
          scheduled_date: visit.scheduled_date,
          customer_id: visit.customer_id,
          customer_name: visit.customer_name || 'Unknown',
          created_at: visit.created_at
        })
      })
      
      console.log('\n🔧 To fix this, you can either:')
      console.log('1. Update the status of these visits to "completed"')
      console.log('2. Delete test visits if they are not real')
    } else {
      console.log('✅ No pending visits found - the issue might be elsewhere')
    }
    
  } catch (e) {
    console.log('❌ Connection error:', e.message)
  }
}

checkPendingVisits()
