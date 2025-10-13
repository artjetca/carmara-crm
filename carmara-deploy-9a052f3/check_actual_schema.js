import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function checkActualSchema() {
  console.log('🔍 Checking actual scheduled_messages schema...\n')
  
  // Get any existing row to see actual columns
  const { data, error } = await supabase
    .from('scheduled_messages')
    .select('*')
    .limit(1)
  
  if (error) {
    console.log('❌ Error:', error.message)
    return
  }
  
  if (data && data.length > 0) {
    console.log('📋 Actual columns from existing data:')
    console.log(Object.keys(data[0]).join(', '))
    console.log('\nSample row:')
    console.log(data[0])
  } else {
    console.log('📋 No existing data. Testing individual columns...')
    
    const columnsToTest = [
      'id', 'message', 'scheduled_for', 'status', 'created_at', 'updated_at', 'error_message',
      'customer_id', 'customer_ids', 'type', 'subject', 'user_id', 'created_by'
    ]
    
    for (const col of columnsToTest) {
      const { error: colError } = await supabase
        .from('scheduled_messages')
        .select(col)
        .limit(1)
      
      if (colError) {
        console.log(`❌ ${col}: ${colError.message}`)
      } else {
        console.log(`✅ ${col}: exists`)
      }
    }
  }
}

checkActualSchema().catch(console.error)
