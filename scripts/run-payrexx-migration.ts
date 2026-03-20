/**
 * Script to run the Payrexx migration
 * Run with: npx tsx scripts/run-payrexx-migration.ts
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://chjswljpjxjcsbiresnb.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNoanN3bGpwanhqY3NiaXJlc25iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTI2Njg0NCwiZXhwIjoyMDgwODQyODQ0fQ.bNzg5etjoSnRe94-G_gNXGjwk0q7gRt29-aT49fuzVM";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  console.log("Running Payrexx integration migration...");

  // Run migration SQL
  const { error } = await supabase.rpc('exec_sql', {
    sql: `
      -- Add Payrexx-specific columns to consultations table
      ALTER TABLE IF EXISTS consultations
        ADD COLUMN IF NOT EXISTS payrexx_gateway_id INTEGER,
        ADD COLUMN IF NOT EXISTS payrexx_gateway_hash TEXT,
        ADD COLUMN IF NOT EXISTS payrexx_payment_link TEXT,
        ADD COLUMN IF NOT EXISTS payrexx_transaction_id INTEGER,
        ADD COLUMN IF NOT EXISTS payrexx_transaction_uuid TEXT,
        ADD COLUMN IF NOT EXISTS payrexx_payment_status TEXT,
        ADD COLUMN IF NOT EXISTS payrexx_paid_at TIMESTAMPTZ;
    `
  });

  if (error) {
    // If exec_sql doesn't exist, try direct SQL approach
    console.log("exec_sql not available, trying alternative approach...");
    
    // Try adding columns one by one using raw SQL
    const columns = [
      { name: 'payrexx_gateway_id', type: 'INTEGER' },
      { name: 'payrexx_gateway_hash', type: 'TEXT' },
      { name: 'payrexx_payment_link', type: 'TEXT' },
      { name: 'payrexx_transaction_id', type: 'INTEGER' },
      { name: 'payrexx_transaction_uuid', type: 'TEXT' },
      { name: 'payrexx_payment_status', type: 'TEXT' },
      { name: 'payrexx_paid_at', type: 'TIMESTAMPTZ' },
    ];

    for (const col of columns) {
      console.log(`Checking column: ${col.name}`);
      // Check if column exists by querying
      const { data, error: queryError } = await supabase
        .from('consultations')
        .select(col.name)
        .limit(1);
      
      if (queryError && queryError.message.includes('does not exist')) {
        console.log(`Column ${col.name} needs to be added`);
      } else {
        console.log(`Column ${col.name} already exists or accessible`);
      }
    }

    console.log("\n⚠️  Migration needs to be run manually in Supabase Dashboard.");
    console.log("Go to: https://supabase.com/dashboard/project/chjswljpjxjcsbiresnb/sql/new");
    console.log("And run the SQL from: migrations/20250117_payrexx_integration.sql");
    return;
  }

  console.log("✅ Migration completed successfully!");
}

runMigration().catch(console.error);
