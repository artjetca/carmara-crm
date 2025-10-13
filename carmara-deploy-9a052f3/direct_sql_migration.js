import pg from 'pg';

// Database connection using direct PostgreSQL connection
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres.aotpcnwjjpkzxnhvmcvb:your_password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';

async function runDirectSQLMigration() {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Check if column exists
    const checkQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'customers' AND column_name = 'customer_type';
    `;

    const checkResult = await client.query(checkQuery);
    
    if (checkResult.rows.length > 0) {
      console.log('✅ customer_type column already exists');
    } else {
      console.log('Adding customer_type column...');
      
      // Add the column
      await client.query(`
        ALTER TABLE customers 
        ADD COLUMN customer_type TEXT 
        CHECK (customer_type IN ('formal', 'potential'));
      `);

      console.log('✅ customer_type column added');
    }

    // Update existing records
    console.log('Updating existing records...');
    
    const updateResult = await client.query(`
      UPDATE customers 
      SET customer_type = CASE 
        WHEN LOWER(TRIM(COALESCE(contrato, ''))) LIKE '%sin facturacion%' THEN 'potential'
        ELSE 'formal'
      END
      WHERE customer_type IS NULL;
    `);

    console.log(`✅ Updated ${updateResult.rowCount} records`);

    // Verify
    const verifyResult = await client.query(`
      SELECT customer_type, COUNT(*) as count
      FROM customers 
      GROUP BY customer_type
      ORDER BY customer_type;
    `);

    console.log('✅ Verification results:');
    console.table(verifyResult.rows);

  } catch (error) {
    console.error('Migration failed:', error.message);
  } finally {
    await client.end();
  }
}

runDirectSQLMigration();
