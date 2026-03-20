/**
 * Add Missing Database Columns Migration
 * Adds columns that the application expects but don't exist in the schema
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mwtdhbllkzuryswrumrd.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// SQL statements to add missing columns
const MIGRATIONS = [
  // ============================================
  // CONSULTATIONS TABLE - Missing columns
  // ============================================
  {
    name: 'consultations.invoice_status',
    sql: `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS invoice_status text CHECK (invoice_status IN ('OPEN', 'PAID', 'CANCELLED', 'OVERPAID', 'PARTIAL_LOSS', 'PARTIAL_PAID')) DEFAULT 'OPEN'`
  },
  {
    name: 'consultations.invoice_id',
    sql: `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS invoice_id text`
  },
  {
    name: 'consultations.invoice_paid_amount',
    sql: `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS invoice_paid_amount numeric(12, 2)`
  },
  {
    name: 'consultations.invoice_pdf_path',
    sql: `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS invoice_pdf_path text`
  },
  {
    name: 'consultations.payment_link_token',
    sql: `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS payment_link_token text`
  },
  {
    name: 'consultations.payrexx_payment_link',
    sql: `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS payrexx_payment_link text`
  },
  {
    name: 'consultations.payrexx_payment_status',
    sql: `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS payrexx_payment_status text`
  },
  {
    name: 'consultations.reference_number',
    sql: `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS reference_number text`
  },
  {
    name: 'consultations.diagnosis_code',
    sql: `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS diagnosis_code text`
  },
  {
    name: 'consultations.ref_icd10',
    sql: `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS ref_icd10 text`
  },
  {
    name: 'consultations.linked_invoice_id',
    sql: `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS linked_invoice_id uuid`
  },
  {
    name: 'consultations.linked_invoice_status',
    sql: `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS linked_invoice_status text`
  },
  {
    name: 'consultations.linked_invoice_number',
    sql: `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS linked_invoice_number text`
  },
  {
    name: 'consultations.medidata_status',
    sql: `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS medidata_status text`
  },

  // ============================================
  // APPOINTMENTS TABLE - Missing columns
  // ============================================
  {
    name: 'appointments.title',
    sql: `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS title text`
  },
  {
    name: 'appointments.notes',
    sql: `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS notes text`
  },
  {
    name: 'appointments.calendar_event_id',
    sql: `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS calendar_event_id text`
  },
  {
    name: 'appointments.updated_at',
    sql: `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now()`
  },

  // ============================================
  // EMAILS TABLE - Missing columns
  // ============================================
  {
    name: 'emails.read_at',
    sql: `ALTER TABLE emails ADD COLUMN IF NOT EXISTS read_at timestamptz`
  },
  {
    name: 'emails.scheduled_for',
    sql: `ALTER TABLE emails ADD COLUMN IF NOT EXISTS scheduled_for timestamptz`
  },
  {
    name: 'emails.updated_at',
    sql: `ALTER TABLE emails ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now()`
  },
  {
    name: 'emails.mailgun_message_id',
    sql: `ALTER TABLE emails ADD COLUMN IF NOT EXISTS mailgun_message_id text`
  },
  {
    name: 'emails.in_reply_to',
    sql: `ALTER TABLE emails ADD COLUMN IF NOT EXISTS in_reply_to text`
  },
  {
    name: 'emails.thread_id',
    sql: `ALTER TABLE emails ADD COLUMN IF NOT EXISTS thread_id text`
  },

  // ============================================
  // DEAL_STAGES TABLE - Missing columns
  // ============================================
  {
    name: 'deal_stages.is_demo',
    sql: `ALTER TABLE deal_stages ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false`
  },

  // ============================================
  // LEAD_IMPORTS TABLE - Create if not exists
  // ============================================
  {
    name: 'lead_imports table',
    sql: `CREATE TABLE IF NOT EXISTS lead_imports (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      filename text NOT NULL,
      service text,
      total_leads integer,
      imported_count integer,
      failed_count integer,
      imported_patient_ids uuid[],
      errors text[],
      import_date timestamptz DEFAULT now(),
      created_at timestamptz DEFAULT now()
    )`
  },

  // ============================================
  // PATIENTS TABLE - Missing source values constraint update
  // ============================================
  {
    name: 'patients.source constraint update',
    sql: `DO $$ BEGIN
      ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_source_check;
      ALTER TABLE patients ADD CONSTRAINT patients_source_check 
        CHECK (source IN ('manual','event','meta','google','facebook','instagram','tiktok','website','referral','other'));
    EXCEPTION WHEN others THEN NULL;
    END $$`
  }
];

async function runMigrations() {
  console.log('='.repeat(60));
  console.log('Running Database Migrations');
  console.log('='.repeat(60));
  console.log();

  let success = 0;
  let failed = 0;
  const errors = [];

  for (const migration of MIGRATIONS) {
    process.stdout.write(`Migrating: ${migration.name}... `);
    
    try {
      const { error } = await supabase.rpc('exec_sql', { sql: migration.sql });
      
      if (error) {
        // Try direct SQL execution via REST API
        const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
          },
          body: JSON.stringify({ sql: migration.sql })
        });
        
        if (!response.ok) {
          throw new Error(error.message || 'RPC failed');
        }
      }
      
      console.log('OK');
      success++;
    } catch (err) {
      // Fallback: execute via Supabase SQL editor simulation
      console.log('SKIPPED (will try SQL directly)');
      errors.push({ name: migration.name, sql: migration.sql });
    }
  }

  console.log();
  console.log('='.repeat(60));
  console.log('Migration Summary');
  console.log('='.repeat(60));
  console.log(`Successful: ${success}`);
  console.log(`Need manual execution: ${errors.length}`);
  
  if (errors.length > 0) {
    console.log('\n** The following SQL needs to be run manually in Supabase SQL Editor: **\n');
    
    // Write SQL to file for manual execution
    const sqlStatements = errors.map(e => `-- ${e.name}\n${e.sql};`).join('\n\n');
    const fs = require('fs');
    fs.writeFileSync('scripts/manual-migrations.sql', sqlStatements);
    console.log('SQL saved to: scripts/manual-migrations.sql');
  }
}

runMigrations().catch(console.error);
