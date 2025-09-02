import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'
dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function applySchemaFix() {
  try {
    console.log('🔧 Applying scheduled_messages schema fix...\n')

    // Read the SQL file
    const sqlContent = fs.readFileSync('fix_scheduled_messages_schema.sql', 'utf8')
    
    // Split into individual statements (simple approach)
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'))

    console.log(`Found ${statements.length} SQL statements to execute\n`)

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i]
      if (!statement) continue

      console.log(`Executing statement ${i + 1}/${statements.length}...`)
      console.log(`SQL: ${statement.substring(0, 100)}${statement.length > 100 ? '...' : ''}`)

      const { data, error } = await supabase.rpc('exec_sql', { sql_query: statement })
      
      if (error) {
        console.log(`❌ Error in statement ${i + 1}:`, error.message)
        // Continue with other statements even if one fails
      } else {
        console.log(`✅ Statement ${i + 1} executed successfully`)
      }
      console.log('')
    }

    console.log('🎉 Schema fix application completed!')

  } catch (error) {
    console.error('❌ Schema fix error:', error.message)
  }
}

applySchemaFix()
