import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://aotpcnwjjpkzxnhvmcvb.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function runMigration() {
  if (!serviceRoleKey) {
    console.error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
    process.exit(1);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { 
    auth: { autoRefreshToken: false, persistSession: false } 
  });

  try {
    console.log('Adding customer_type column to customers table...');
    
    // Add the customer_type column
    const { error: addColumnError } = await admin.rpc('exec_sql', {
      sql: `
        ALTER TABLE customers 
        ADD COLUMN IF NOT EXISTS customer_type TEXT 
        CHECK (customer_type IN ('formal', 'potential'));
      `
    });

    if (addColumnError) {
      console.error('Error adding column:', addColumnError);
      process.exit(1);
    }

    console.log('✅ customer_type column added successfully');

    // Update existing records based on contrato field
    console.log('Updating existing records...');
    
    const { error: updateError } = await admin.rpc('exec_sql', {
      sql: `
        UPDATE customers 
        SET customer_type = CASE 
          WHEN LOWER(TRIM(COALESCE(contrato, ''))) LIKE '%sin facturacion%' THEN 'potential'
          ELSE 'formal'
        END
        WHERE customer_type IS NULL;
      `
    });

    if (updateError) {
      console.error('Error updating records:', updateError);
      process.exit(1);
    }

    console.log('✅ Existing records updated successfully');

    // Verify the migration
    const { data: sampleData, error: selectError } = await admin
      .from('customers')
      .select('id, name, contrato, customer_type')
      .limit(5);

    if (selectError) {
      console.error('Error verifying migration:', selectError);
      process.exit(1);
    }

    console.log('✅ Migration verification:');
    console.table(sampleData);

    console.log('🎉 Migration completed successfully!');

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
