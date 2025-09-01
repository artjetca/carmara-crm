import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function verifyFix() {
  console.log('🔍 Verifying scheduled_messages table after fix...\n')
  
  // Test if all required columns exist
  const requiredColumns = ['id', 'customer_id', 'type', 'subject', 'message', 'scheduled_for', 'status', 'user_id', 'created_at']
  
  for (const col of requiredColumns) {
    const { error } = await supabase
      .from('scheduled_messages')
      .select(col)
      .limit(1)
    
    if (error) {
      console.log(`❌ ${col}: ${error.message}`)
    } else {
      console.log(`✅ ${col}: exists`)
    }
  }
  
  console.log('\n📋 Next steps:')
  console.log('If columns are missing:')
  console.log('1. Go to Supabase Dashboard → SQL Editor')
  console.log('2. Run the final_fix.sql script')
  console.log('3. Hard refresh browser (Cmd+Shift+R)')
  console.log('4. Test Communications → Programar Mensaje')
}

verifyFix().catch(console.error)
