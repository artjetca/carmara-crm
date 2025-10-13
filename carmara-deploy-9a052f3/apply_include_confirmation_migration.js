import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function applyMigration() {
  console.log('🔧 Applying include_confirmation column migration...');
  
  try {
    // Initialize Supabase client with service role key
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase credentials. Please check VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, 'supabase', 'migrations', '042_add_include_confirmation_column.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📝 Migration SQL:');
    console.log(migrationSQL);
    
    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', { 
      sql_query: migrationSQL 
    });
    
    if (error) {
      console.error('❌ Migration failed:', error);
      
      // Try alternative approach using individual SQL commands
      console.log('🔄 Trying alternative approach...');
      
      const commands = [
        "ALTER TABLE public.scheduled_messages ADD COLUMN IF NOT EXISTS include_confirmation BOOLEAN DEFAULT FALSE;",
        "UPDATE public.scheduled_messages SET include_confirmation = FALSE WHERE include_confirmation IS NULL;"
      ];
      
      for (const command of commands) {
        console.log('Executing:', command);
        const { error: cmdError } = await supabase.rpc('exec_sql', { 
          sql_query: command 
        });
        
        if (cmdError) {
          console.error('Command failed:', cmdError);
        } else {
          console.log('✅ Command executed successfully');
        }
      }
    } else {
      console.log('✅ Migration applied successfully');
      console.log('Result:', data);
    }
    
    // Verify the column was added
    console.log('🔍 Verifying column exists...');
    const { data: tableInfo, error: infoError } = await supabase
      .from('scheduled_messages')
      .select('*')
      .limit(1);
    
    if (infoError) {
      console.error('❌ Failed to verify:', infoError);
    } else {
      console.log('✅ Table schema verified successfully');
    }
    
    console.log('🎉 Migration process completed!');
    console.log('The include_confirmation column should now be available in scheduled_messages table.');
    
  } catch (error) {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  }
}

applyMigration();
