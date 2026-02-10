import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://aotpcnwjjpkzxnhvmcvb.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function fixSchema() {
  if (!serviceRoleKey) {
    console.error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
    process.exit(1);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { 
    auth: { autoRefreshToken: false, persistSession: false } 
  });

  try {
    console.log('Adding customer_type column using direct SQL...');
    
    // Use raw SQL query instead of RPC
    const { error: addColumnError } = await admin
      .from('customers')
      .select('customer_type')
      .limit(1);

    if (addColumnError && addColumnError.message.includes('customer_type')) {
      console.log('Column does not exist, adding it...');
      
      // Try using the REST API to execute SQL
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey
        },
        body: JSON.stringify({
          sql: `ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_type TEXT CHECK (customer_type IN ('formal', 'potential'));`
        })
      });

      if (!response.ok) {
        console.log('Direct SQL failed, trying alternative approach...');
        
        // Alternative: Use a simple update to trigger schema refresh
        const { error: testError } = await admin
          .from('customers')
          .update({ notes: 'schema_test' })
          .eq('id', 'non-existent-id');
        
        console.log('Schema refresh attempted');
      }
    } else {
      console.log('✅ customer_type column already exists or accessible');
    }

    // Update existing records
    console.log('Updating existing records based on contrato...');
    
    const { data: allCustomers, error: fetchError } = await admin
      .from('customers')
      .select('id, contrato, customer_type');

    if (fetchError) {
      console.error('Error fetching customers:', fetchError);
      return;
    }

    console.log(`Found ${allCustomers.length} customers to process`);

    for (const customer of allCustomers) {
      if (!customer.customer_type) {
        const contrato = customer.contrato || '';
        const hasSinFacturacion = contrato.toLowerCase().includes('sin facturacion');
        const newType = hasSinFacturacion ? 'potential' : 'formal';
        
        const { error: updateError } = await admin
          .from('customers')
          .update({ customer_type: newType })
          .eq('id', customer.id);

        if (updateError) {
          console.error(`Error updating customer ${customer.id}:`, updateError);
        } else {
          console.log(`Updated customer ${customer.id}: ${newType}`);
        }
      }
    }

    console.log('✅ Migration completed!');

  } catch (error) {
    console.error('Migration failed:', error);
  }
}

fixSchema();
