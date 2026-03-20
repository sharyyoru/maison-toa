require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 
  `postgresql://postgres.${process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)/)?.[1]}:${process.env.SUPABASE_SERVICE_ROLE_KEY}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`;

async function runMigration() {
  // Extract project ref from Supabase URL
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const projectRef = supabaseUrl?.match(/https:\/\/([^.]+)/)?.[1];
  
  if (!projectRef) {
    console.error('Could not extract project ref from SUPABASE_URL');
    process.exit(1);
  }

  // Construct the direct database connection URL
  const connectionString = process.env.DATABASE_URL || 
    `postgresql://postgres.${projectRef}:${process.env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_SERVICE_ROLE_KEY}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`;

  console.log('Connecting to database...');
  console.log('Project ref:', projectRef);

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected successfully!\n');

    // 1. Add code column to services
    console.log('1. Adding code column to services table...');
    await client.query('ALTER TABLE services ADD COLUMN IF NOT EXISTS code text');
    console.log('   Done!\n');

    // 2. Create invoices table
    console.log('2. Creating invoices table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
        consultation_id uuid REFERENCES consultations(id) ON DELETE SET NULL,
        invoice_number text NOT NULL,
        invoice_date timestamptz DEFAULT now(),
        due_date timestamptz,
        doctor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        doctor_name text,
        provider_id uuid,
        provider_name text,
        payment_method text,
        total_amount numeric(12,2) NOT NULL DEFAULT 0,
        paid_amount numeric(12,2) DEFAULT 0,
        status text NOT NULL DEFAULT 'draft',
        is_complimentary boolean DEFAULT false,
        is_archived boolean DEFAULT false,
        pdf_path text,
        notes text,
        created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        created_by_name text,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS invoices_patient_id_idx ON invoices(patient_id)');
    await client.query('CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices(status)');
    console.log('   Done!\n');

    // 3. Create invoice_items table
    console.log('3. Creating invoice_items table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoice_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        service_id uuid REFERENCES services(id) ON DELETE SET NULL,
        description text NOT NULL,
        quantity integer NOT NULL DEFAULT 1,
        unit_price numeric(12,2) NOT NULL DEFAULT 0,
        discount_percent numeric(5,2) DEFAULT 0,
        total_price numeric(12,2) NOT NULL DEFAULT 0,
        sort_order integer DEFAULT 0,
        created_at timestamptz DEFAULT now()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS invoice_items_invoice_id_idx ON invoice_items(invoice_id)');
    console.log('   Done!\n');

    // 4. Create medication_templates table
    console.log('4. Creating medication_templates table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS medication_templates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        description text,
        service_id uuid REFERENCES services(id) ON DELETE SET NULL,
        is_active boolean DEFAULT true,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS medication_templates_is_active_idx ON medication_templates(is_active)');
    console.log('   Done!\n');

    // 5. Create medication_template_items table
    console.log('5. Creating medication_template_items table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS medication_template_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        template_id uuid NOT NULL REFERENCES medication_templates(id) ON DELETE CASCADE,
        product_name text NOT NULL,
        product_number integer,
        product_type text DEFAULT 'MEDICATION',
        intake_kind text DEFAULT 'FIXED',
        amount_morning text,
        amount_noon text,
        amount_evening text,
        amount_night text,
        quantity integer DEFAULT 1,
        intake_note text,
        sort_order integer DEFAULT 0,
        created_at timestamptz DEFAULT now()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS medication_template_items_template_id_idx ON medication_template_items(template_id)');
    console.log('   Done!\n');

    // 6. Enable RLS and create policies
    console.log('6. Enabling RLS and creating policies...');
    
    const tables = ['invoices', 'invoice_items', 'medication_templates', 'medication_template_items'];
    for (const table of tables) {
      await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      
      // Drop existing policies if they exist
      await client.query(`DROP POLICY IF EXISTS "Authenticated users can view ${table}" ON ${table}`);
      await client.query(`DROP POLICY IF EXISTS "Authenticated users can insert ${table}" ON ${table}`);
      await client.query(`DROP POLICY IF EXISTS "Authenticated users can update ${table}" ON ${table}`);
      await client.query(`DROP POLICY IF EXISTS "Authenticated users can delete ${table}" ON ${table}`);
      
      // Create new policies
      await client.query(`CREATE POLICY "Authenticated users can view ${table}" ON ${table} FOR SELECT TO authenticated USING (true)`);
      await client.query(`CREATE POLICY "Authenticated users can insert ${table}" ON ${table} FOR INSERT TO authenticated WITH CHECK (true)`);
      await client.query(`CREATE POLICY "Authenticated users can update ${table}" ON ${table} FOR UPDATE TO authenticated USING (true)`);
      await client.query(`CREATE POLICY "Authenticated users can delete ${table}" ON ${table} FOR DELETE TO authenticated USING (true)`);
    }
    console.log('   Done!\n');

    console.log('=== Migration completed successfully! ===');

  } catch (error) {
    console.error('Migration error:', error.message);
    if (error.message.includes('password authentication failed')) {
      console.log('\nTo run this migration manually:');
      console.log(`1. Go to: https://supabase.com/dashboard/project/${projectRef}/sql/new`);
      console.log('2. Copy the SQL from: supabase/migrations/20260321_add_missing_tables.sql');
      console.log('3. Click Run');
    }
  } finally {
    await client.end();
  }
}

runMigration();
