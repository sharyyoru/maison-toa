import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST() {
  try {
    const results = {
      patientsUpdated: 0,
      dobMigrated: 0,
      townMigrated: 0,
      employerMigrated: 0,
      insuranceMigrated: 0,
      errors: [] as string[],
    };

    // Step 1: Migrate date_of_birth to dob for patients where dob is null
    // First check if the date_of_birth column exists
    const { data: patients, error: patientsError } = await supabaseAdmin
      .from("patients")
      .select("id, dob, date_of_birth, town, city, current_employer, employer")
      .or("dob.is.null,town.is.null,current_employer.is.null");

    if (patientsError) {
      // If date_of_birth column doesn't exist, this is fine - just skip
      console.log("Note: Some legacy columns may not exist:", patientsError.message);
    }

    if (patients && patients.length > 0) {
      for (const patient of patients) {
        const updates: Record<string, unknown> = {};

        // Migrate date_of_birth to dob
        if (!patient.dob && (patient as any).date_of_birth) {
          updates.dob = (patient as any).date_of_birth;
          results.dobMigrated++;
        }

        // Migrate city to town
        if (!patient.town && (patient as any).city) {
          updates.town = (patient as any).city;
          results.townMigrated++;
        }

        // Migrate employer to current_employer
        if (!patient.current_employer && (patient as any).employer) {
          updates.current_employer = (patient as any).employer;
          results.employerMigrated++;
        }

        if (Object.keys(updates).length > 0) {
          const { error: updateError } = await supabaseAdmin
            .from("patients")
            .update(updates)
            .eq("id", patient.id);

          if (updateError) {
            results.errors.push(`Failed to update patient ${patient.id}: ${updateError.message}`);
          } else {
            results.patientsUpdated++;
          }
        }
      }
    }

    // Step 2: Check if patient_insurance table exists and migrate to patient_insurances
    const { data: oldInsurance, error: oldInsuranceError } = await supabaseAdmin
      .from("patient_insurance")
      .select("*");

    if (!oldInsuranceError && oldInsurance && oldInsurance.length > 0) {
      for (const ins of oldInsurance) {
        // Check if this insurance already exists in patient_insurances
        const { data: existing } = await supabaseAdmin
          .from("patient_insurances")
          .select("id")
          .eq("patient_id", ins.patient_id)
          .maybeSingle();

        if (!existing) {
          // Insert into patient_insurances
          const { error: insertError } = await supabaseAdmin
            .from("patient_insurances")
            .insert({
              patient_id: ins.patient_id,
              provider_name: ins.provider_name,
              card_number: ins.card_number,
              insurance_type: ins.insurance_type,
            });

          if (insertError) {
            results.errors.push(`Failed to migrate insurance for patient ${ins.patient_id}: ${insertError.message}`);
          } else {
            results.insuranceMigrated++;
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "Migration completed",
      results,
    });
  } catch (error) {
    console.error("Migration error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Migration failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Preview what will be migrated without making changes
  try {
    const preview = {
      patientsNeedingDobMigration: 0,
      patientsNeedingTownMigration: 0,
      patientsNeedingEmployerMigration: 0,
      insuranceRecordsToMigrate: 0,
    };

    // Check patients needing migration
    const { data: patients } = await supabaseAdmin
      .from("patients")
      .select("id, dob, date_of_birth, town, city, current_employer, employer");

    if (patients) {
      for (const p of patients) {
        if (!p.dob && (p as any).date_of_birth) preview.patientsNeedingDobMigration++;
        if (!p.town && (p as any).city) preview.patientsNeedingTownMigration++;
        if (!p.current_employer && (p as any).employer) preview.patientsNeedingEmployerMigration++;
      }
    }

    // Check old insurance table
    const { data: oldInsurance, error: oldInsErr } = await supabaseAdmin
      .from("patient_insurance")
      .select("patient_id");

    if (!oldInsErr && oldInsurance) {
      for (const ins of oldInsurance) {
        const { data: existing } = await supabaseAdmin
          .from("patient_insurances")
          .select("id")
          .eq("patient_id", ins.patient_id)
          .maybeSingle();

        if (!existing) {
          preview.insuranceRecordsToMigrate++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      preview,
      message: "Use POST to run the migration",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Preview failed" },
      { status: 500 }
    );
  }
}
