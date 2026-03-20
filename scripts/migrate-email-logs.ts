/**
 * Migration Script: Import email_logs from old Alice to new system
 * 
 * Usage:
 *   1. Export email_logs from old database as JSON file
 *   2. Place it as: scripts/old-email-logs.json
 *   3. Run: npx ts-node scripts/migrate-email-logs.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// Load environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Old email_logs structure
interface OldEmailLog {
  id: number;
  subject: string;
  body: string;
  from_email: string;
  to_email: string;
  direction: "outbound" | "inbound";
  type: string; // general, appointment_set, closed_won, etc.
  status: string;
  activity_log_id: number | null;
  message_id: string | null;
  created_at: string;
  updated_at: string;
}

// New emails structure
interface NewEmail {
  patient_id: string | null;
  deal_id: string | null;
  to_address: string;
  from_address: string | null;
  subject: string;
  body: string;
  status: "draft" | "queued" | "sent" | "failed";
  direction: "outbound" | "inbound";
  sent_at: string | null;
  created_at: string;
}

async function main() {
  console.log("🚀 Starting email_logs migration...\n");

  // Step 1: Load old email_logs from JSON file
  const jsonPath = path.join(__dirname, "old-email-logs.json");
  
  if (!fs.existsSync(jsonPath)) {
    console.error(`❌ File not found: ${jsonPath}`);
    console.error("   Export your old email_logs as JSON and place it there.");
    process.exit(1);
  }

  const oldEmailLogs: OldEmailLog[] = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  console.log(`📧 Found ${oldEmailLogs.length} email logs to migrate\n`);

  // Step 2: Load all patients to build email -> patient_id map
  console.log("👥 Loading patients for email matching...");
  const { data: patients, error: patientsError } = await supabase
    .from("patients")
    .select("id, email");

  if (patientsError) {
    console.error("❌ Failed to load patients:", patientsError.message);
    process.exit(1);
  }

  // Build email -> patient_id lookup (case-insensitive)
  const emailToPatientId = new Map<string, string>();
  for (const patient of patients || []) {
    if (patient.email) {
      emailToPatientId.set(patient.email.toLowerCase().trim(), patient.id);
    }
  }
  console.log(`   Found ${emailToPatientId.size} patients with emails\n`);

  // Step 3: Transform and insert emails in batches
  const BATCH_SIZE = 100;
  let successCount = 0;
  let errorCount = 0;
  let matchedCount = 0;
  let unmatchedCount = 0;

  const newEmails: NewEmail[] = oldEmailLogs.map((old) => {
    // Match patient by to_email (for outbound) or from_email (for inbound)
    const matchEmail = old.direction === "outbound" 
      ? old.to_email?.toLowerCase().trim() 
      : old.from_email?.toLowerCase().trim();
    
    const patientId = matchEmail ? emailToPatientId.get(matchEmail) || null : null;
    
    if (patientId) {
      matchedCount++;
    } else {
      unmatchedCount++;
    }

    // Map status (handle any edge cases)
    let status: "draft" | "queued" | "sent" | "failed" = "sent";
    if (old.status === "failed") status = "failed";
    else if (old.status === "queued") status = "queued";
    else if (old.status === "draft") status = "draft";
    else status = "sent";

    return {
      patient_id: patientId,
      deal_id: null, // Can't determine from old data
      to_address: old.to_email || "",
      from_address: old.from_email || null,
      subject: old.subject || "(no subject)",
      body: old.body || "",
      status,
      direction: old.direction || "outbound",
      sent_at: status === "sent" ? old.created_at : null,
      created_at: old.created_at,
    };
  });

  console.log(`📊 Email matching results:`);
  console.log(`   ✅ Matched to patient: ${matchedCount}`);
  console.log(`   ⚠️  No patient match: ${unmatchedCount}\n`);

  console.log(`📤 Inserting emails in batches of ${BATCH_SIZE}...`);

  for (let i = 0; i < newEmails.length; i += BATCH_SIZE) {
    const batch = newEmails.slice(i, i + BATCH_SIZE);
    
    const { error } = await supabase
      .from("emails")
      .insert(batch);

    if (error) {
      console.error(`   ❌ Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error.message);
      errorCount += batch.length;
    } else {
      successCount += batch.length;
      process.stdout.write(`   ✅ Inserted ${successCount}/${newEmails.length}\r`);
    }
  }

  console.log("\n");
  console.log("═══════════════════════════════════════");
  console.log("📊 MIGRATION COMPLETE");
  console.log("═══════════════════════════════════════");
  console.log(`   ✅ Successfully inserted: ${successCount}`);
  console.log(`   ❌ Failed: ${errorCount}`);
  console.log(`   👥 Linked to patients: ${matchedCount}`);
  console.log(`   📧 Orphaned (no patient): ${unmatchedCount}`);
  console.log("═══════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
