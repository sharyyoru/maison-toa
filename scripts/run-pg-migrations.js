/**
 * Run Database Migrations using pg library
 * Connects directly to Supabase PostgreSQL database
 */

const { Pool } = require('pg');
const fs = require('fs');

// Database connection using Supabase connection string
// Format: postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
const DATABASE_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!DATABASE_URL) {
  console.log('No DATABASE_URL found. Using Supabase Management API approach...');
  console.log('');
  console.log('To run migrations, you have two options:');
  console.log('');
  console.log('OPTION 1: Set DATABASE_URL environment variable');
  console.log('  Format: postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres');
  console.log('  Then run: node scripts/run-pg-migrations.js');
  console.log('');
  console.log('OPTION 2: Run SQL manually in Supabase Dashboard');
  console.log('  1. Go to: https://supabase.com/dashboard/project/mwtdhbllkzuryswrumrd/sql/new');
  console.log('  2. Copy contents of: scripts/manual-migrations.sql');
  console.log('  3. Click "Run"');
  console.log('');
  
  // Output the SQL for easy copying
  console.log('='.repeat(60));
  console.log('SQL TO RUN:');
  console.log('='.repeat(60));
  const sql = fs.readFileSync('scripts/manual-migrations.sql', 'utf-8');
  console.log(sql);
  
  process.exit(0);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function runMigrations() {
  console.log('='.repeat(60));
  console.log('Running Database Migrations');
  console.log('='.repeat(60));
  console.log();

  const client = await pool.connect();
  
  try {
    // Read and execute the SQL file
    const sql = fs.readFileSync('scripts/manual-migrations.sql', 'utf-8');
    
    console.log('Executing migrations...\n');
    
    await client.query(sql);
    
    console.log('✓ All migrations completed successfully!');
    
    // Verify the columns were added
    console.log('\nVerifying new columns...');
    
    const verifyQueries = [
      { table: 'consultations', column: 'invoice_status' },
      { table: 'appointments', column: 'title' },
      { table: 'emails', column: 'read_at' },
    ];
    
    for (const { table, column } of verifyQueries) {
      const result = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = $1 AND column_name = $2
      `, [table, column]);
      
      if (result.rows.length > 0) {
        console.log(`  ✓ ${table}.${column} exists`);
      } else {
        console.log(`  ✗ ${table}.${column} NOT FOUND`);
      }
    }
    
  } catch (error) {
    console.error('Migration error:', error.message);
    
    // Try executing statements one by one
    console.log('\nTrying individual statements...');
    const sql = fs.readFileSync('scripts/manual-migrations.sql', 'utf-8');
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--') && s.length > 10);
    
    let success = 0;
    let failed = 0;
    
    for (const stmt of statements) {
      try {
        await client.query(stmt);
        success++;
      } catch (err) {
        // Ignore "already exists" errors
        if (!err.message.includes('already exists') && !err.message.includes('duplicate')) {
          console.log(`  Warning: ${err.message.substring(0, 100)}`);
        }
        failed++;
      }
    }
    
    console.log(`\nResults: ${success} succeeded, ${failed} failed/skipped`);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch(console.error);
