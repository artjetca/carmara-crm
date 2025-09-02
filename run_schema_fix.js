import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function runSchemaFix() {
  try {
    console.log('🔧 Running scheduled_messages schema fix...\n')
    
    const sql = readFileSync('./fix_scheduled_messages_schema.sql', 'utf8')
    
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql })
    
    if (error) {
      console.log('❌ Migration failed:', error)
      
      // Try alternative approach - execute statements one by one
      console.log('\n🔄 Trying individual statements...')
      
      const statements = sql.split(';').filter(s => s.trim().length > 0)
      
      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i].trim()
        if (!stmt) continue
        
        console.log(`Executing statement ${i + 1}/${statements.length}...`)
        
        const { error: stmtError } = await supabase.rpc('exec_sql', { sql_query: stmt })
        
        if (stmtError) {
          console.log(`❌ Statement ${i + 1} failed:`, stmtError.message)
        } else {
          console.log(`✅ Statement ${i + 1} success`)
        }
      }
    } else {
      console.log('✅ Migration completed successfully')
    }
    
    // Verify the fix
    console.log('\n🔍 Verifying schema...')
    const { data: testData, error: testError } = await supabase
      .from('scheduled_messages')
      .select('id, customer_id, type, subject, message, scheduled_for, status, user_id')
      .limit(1)
    
    if (testError) {
      console.log('❌ Verification failed:', testError.message)
    } else {
      console.log('✅ Schema verification successful')
      console.log('📋 Available columns: id, customer_id, type, subject, message, scheduled_for, status, user_id')
    }
    
  } catch (err) {
    console.error('💥 Script error:', err)
  }
}

runSchemaFix()
