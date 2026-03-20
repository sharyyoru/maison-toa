import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type MergeRequest = {
  primaryPatientId: string;
  patientIdsToMerge: string[];
  mergedData?: {
    first_name?: string;
    last_name?: string;
    email?: string | null;
    phone?: string | null;
    dob?: string | null;
    street_address?: string | null;
    town?: string | null;
    postal_code?: string | null;
    contact_owner_name?: string | null;
  };
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MergeRequest;
    const { primaryPatientId, patientIdsToMerge, mergedData } = body;

    if (!primaryPatientId || !patientIdsToMerge || patientIdsToMerge.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Start a transaction-like operation by doing all updates in sequence
    console.log(`Merging ${patientIdsToMerge.length} patients into primary patient ${primaryPatientId}`);

    // 1. Update the primary patient with the merged data (if provided)
    if (mergedData && Object.keys(mergedData).length > 0) {
      const { error: updateError } = await supabase
        .from("patients")
        .update({
          ...mergedData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", primaryPatientId);

      if (updateError) {
        console.error("Error updating primary patient:", updateError);
        return NextResponse.json(
          { error: "Failed to update primary patient" },
          { status: 500 }
        );
      }
    }

    // 2. Merge all related data from other patients to primary patient
    // List of all tables with patient_id foreign key based on database schema
    const tablesToUpdate = [
      "appointments",
      "chat_conversations",
      "consultations",
      "crisalix_reconstructions",
      "deals",
      "documents",
      "email_reply_notifications",
      "emails",
      "invoices",
      "medidata_submissions",
      "patient_consultation_data",
      "patient_documents",
      "patient_health_background",
      "patient_insurances",
      "patient_intake_photos",
      "patient_intake_preferences",
      "patient_intake_submissions",
      "patient_measurements",
      "patient_note_mentions",
      "patient_notes",
      "patient_prescriptions",
      "patient_simulations",
      "patient_treatment_areas",
      "patient_treatment_preferences",
      "scheduled_emails",
      "tasks",
      "whatsapp_conversations",
      "whatsapp_messages",
    ];

    // Tables where patient_id is the primary key (need to delete, not update)
    const tablesToDeleteFrom = [
      "patient_edit_locks",
    ];

    for (const patientId of patientIdsToMerge) {
      console.log(`Merging data from patient ${patientId} to ${primaryPatientId}`);

      // Update all tables with patient_id foreign key
      for (const tableName of tablesToUpdate) {
        const { error } = await supabase
          .from(tableName)
          .update({ patient_id: primaryPatientId })
          .eq("patient_id", patientId);

        if (error) {
          // Log but continue - table might not exist or have no records
          console.log(`Note: Could not update ${tableName}:`, error.message);
        }
      }

      // Delete from tables where patient_id is the primary key
      for (const tableName of tablesToDeleteFrom) {
        const { error } = await supabase
          .from(tableName)
          .delete()
          .eq("patient_id", patientId);

        if (error) {
          console.log(`Note: Could not delete from ${tableName}:`, error.message);
        }
      }
    }

    // 3. Copy files in patient-documents storage bucket (keep originals)
    for (const patientId of patientIdsToMerge) {
      console.log(`Copying storage files from patient ${patientId} to ${primaryPatientId}`);
      
      try {
        // List all files for this patient in patient-documents bucket
        const { data: files, error: listError } = await supabase.storage
          .from("patient-documents")
          .list(patientId);

        if (listError) {
          console.log(`Note: Could not list files for patient ${patientId}:`, listError.message);
          continue;
        }

        if (!files || files.length === 0) {
          console.log(`No files found for patient ${patientId}`);
          continue;
        }

        // List existing files in primary patient's folder to check for duplicates
        const { data: existingFiles } = await supabase.storage
          .from("patient-documents")
          .list(primaryPatientId);

        const existingFileNames = new Set(
          (existingFiles || []).map(f => f.name)
        );

        // Copy each file to the primary patient's folder
        for (const file of files) {
          const oldPath = `${patientId}/${file.name}`;
          let newFileName = file.name;

          // Handle duplicate filenames by appending a counter
          if (existingFileNames.has(newFileName)) {
            const nameParts = newFileName.split('.');
            const extension = nameParts.length > 1 ? nameParts.pop() : '';
            const baseName = nameParts.join('.');
            
            let counter = 1;
            do {
              newFileName = extension 
                ? `${baseName}_${counter}.${extension}`
                : `${baseName}_${counter}`;
              counter++;
            } while (existingFileNames.has(newFileName));
            
            console.log(`File name conflict: ${file.name} → ${newFileName}`);
          }

          const newPath = `${primaryPatientId}/${newFileName}`;

          // Copy file to new location (keeping original)
          const { error: copyError } = await supabase.storage
            .from("patient-documents")
            .copy(oldPath, newPath);

          if (copyError) {
            console.log(`Note: Could not copy file ${oldPath}:`, copyError.message);
            continue;
          }

          // Add to existing files set to prevent duplicates in this batch
          existingFileNames.add(newFileName);
          console.log(`Copied file: ${oldPath} → ${newPath}`);
        }
      } catch (storageError) {
        console.log(`Note: Error processing storage for patient ${patientId}:`, storageError);
      }
    }

    // 4. Delete the merged patients
    const { error: deleteError } = await supabase
      .from("patients")
      .delete()
      .in("id", patientIdsToMerge);

    if (deleteError) {
      console.error("Error deleting merged patients:", deleteError);
      // Provide more context about the error - likely a foreign key constraint
      const errorMessage = deleteError.message?.includes("violates foreign key constraint")
        ? `Failed to delete merged patients: A related record still references this patient. Details: ${deleteError.message}`
        : `Failed to delete merged patients: ${deleteError.message || "Unknown error"}`;
      return NextResponse.json(
        { error: errorMessage, details: deleteError },
        { status: 500 }
      );
    }

    console.log(`Successfully merged ${patientIdsToMerge.length} patients into ${primaryPatientId}`);

    return NextResponse.json({
      success: true,
      primaryPatientId,
      mergedCount: patientIdsToMerge.length,
    });
  } catch (error) {
    console.error("Error merging patients:", error);
    return NextResponse.json(
      { error: "Failed to merge patients", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
