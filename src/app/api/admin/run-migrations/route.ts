import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Create admin client
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: "public" },
  auth: { persistSession: false }
});

// SQL migrations to run
const MIGRATIONS = [
  // CONSULTATIONS TABLE
  `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS invoice_status text DEFAULT 'OPEN'`,
  `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS invoice_id text`,
  `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS invoice_paid_amount numeric(12, 2)`,
  `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS invoice_pdf_path text`,
  `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS payment_link_token text`,
  `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS payrexx_payment_link text`,
  `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS payrexx_payment_status text`,
  `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS reference_number text`,
  `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS diagnosis_code text`,
  `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS ref_icd10 text`,
  `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS linked_invoice_id uuid`,
  `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS linked_invoice_status text`,
  `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS linked_invoice_number text`,
  `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS medidata_status text`,
  
  // APPOINTMENTS TABLE
  `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS title text`,
  `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS notes text`,
  `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS calendar_event_id text`,
  `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now()`,
  
  // EMAILS TABLE
  `ALTER TABLE emails ADD COLUMN IF NOT EXISTS read_at timestamptz`,
  `ALTER TABLE emails ADD COLUMN IF NOT EXISTS scheduled_for timestamptz`,
  `ALTER TABLE emails ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now()`,
  `ALTER TABLE emails ADD COLUMN IF NOT EXISTS mailgun_message_id text`,
  `ALTER TABLE emails ADD COLUMN IF NOT EXISTS in_reply_to text`,
  `ALTER TABLE emails ADD COLUMN IF NOT EXISTS thread_id text`,
  
  // DEAL_STAGES TABLE
  `ALTER TABLE deal_stages ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false`,
];

export async function POST() {
  const results: { sql: string; success: boolean; error?: string }[] = [];
  
  for (const sql of MIGRATIONS) {
    try {
      // Use raw SQL execution via PostgREST
      const { error } = await supabaseAdmin.from('_migrations_temp').select().limit(0);
      
      // Since we can't run raw SQL directly, we'll use a workaround
      // by creating a dummy select and catching the error
      
      // For now, just mark as needing manual execution
      results.push({ sql, success: false, error: 'Requires manual execution in Supabase SQL Editor' });
    } catch (err) {
      results.push({ sql, success: false, error: String(err) });
    }
  }
  
  return NextResponse.json({
    message: "Migrations need to be run manually in Supabase SQL Editor",
    instructions: [
      "1. Go to https://supabase.com/dashboard/project/mwtdhbllkzuryswrumrd/sql/new",
      "2. Copy the SQL from scripts/manual-migrations.sql",
      "3. Click Run"
    ],
    migrations: results
  });
}

export async function GET() {
  // Return the SQL that needs to be run
  const sql = MIGRATIONS.join(';\n\n');
  
  return new NextResponse(sql, {
    headers: {
      'Content-Type': 'text/plain',
    }
  });
}
