import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const patientId = req.nextUrl.searchParams.get("patient_id");
  const email = req.nextUrl.searchParams.get("email");

  if (!patientId && !email) {
    return NextResponse.json({ error: "Provide patient_id or email" }, { status: 400 });
  }

  try {
    const results: Record<string, unknown> = {};

    // Find patient
    let patient;
    if (patientId) {
      const { data, error } = await supabaseAdmin
        .from("patients")
        .select("*")
        .eq("id", patientId)
        .single();
      patient = data;
      results.patient_query_error = error?.message;
    } else if (email) {
      const { data, error } = await supabaseAdmin
        .from("patients")
        .select("*")
        .eq("email", email)
        .single();
      patient = data;
      results.patient_query_error = error?.message;
    }

    results.patient = patient;

    if (!patient) {
      return NextResponse.json({ 
        success: false, 
        message: "Patient not found",
        results 
      });
    }

    const pid = patient.id;

    // Check all intake-related tables
    const submissions = await supabaseAdmin.from("patient_intake_submissions").select("*").eq("patient_id", pid);
    const insurancesNew = await supabaseAdmin.from("patient_insurances").select("*").eq("patient_id", pid);
    const healthBackground = await supabaseAdmin.from("patient_health_background").select("*").eq("patient_id", pid);
    const preferences = await supabaseAdmin.from("patient_intake_preferences").select("*").eq("patient_id", pid);
    
    // These tables might not exist, wrap in try-catch
    let insurancesOld: { data: unknown; error: unknown } = { data: null, error: null };
    let measurements: { data: unknown; error: unknown } = { data: null, error: null };
    let treatmentAreas: { data: unknown; error: unknown } = { data: null, error: null };
    let treatmentPrefs: { data: unknown; error: unknown } = { data: null, error: null };
    let photos: { data: unknown; error: unknown } = { data: null, error: null };

    try {
      insurancesOld = await supabaseAdmin.from("patient_insurance").select("*").eq("patient_id", pid);
    } catch (e) { insurancesOld.error = "table may not exist"; }
    
    try {
      measurements = await supabaseAdmin.from("patient_measurements").select("*").eq("patient_id", pid);
    } catch (e) { measurements.error = "table may not exist"; }
    
    try {
      treatmentAreas = await supabaseAdmin.from("patient_treatment_areas").select("*").eq("patient_id", pid);
    } catch (e) { treatmentAreas.error = "table may not exist"; }
    
    try {
      treatmentPrefs = await supabaseAdmin.from("patient_treatment_preferences").select("*").eq("patient_id", pid);
    } catch (e) { treatmentPrefs.error = "table may not exist"; }
    
    try {
      photos = await supabaseAdmin.from("patient_intake_photos").select("*").eq("patient_id", pid);
    } catch (e) { photos.error = "table may not exist"; }

    results.intake_submissions = {
      count: submissions.data?.length || 0,
      data: submissions.data,
      error: submissions.error?.message
    };

    results.patient_insurances = {
      count: insurancesNew.data?.length || 0,
      data: insurancesNew.data,
      error: insurancesNew.error?.message
    };

    results.patient_insurance_legacy = {
      count: (insurancesOld as any).data?.length || 0,
      data: (insurancesOld as any).data,
      error: (insurancesOld as any).error
    };

    results.patient_health_background = {
      count: healthBackground.data?.length || 0,
      data: healthBackground.data,
      error: healthBackground.error?.message
    };

    results.patient_intake_preferences = {
      count: preferences.data?.length || 0,
      data: preferences.data,
      error: preferences.error?.message
    };

    results.patient_measurements = {
      count: (measurements as any).data?.length || 0,
      data: (measurements as any).data,
      error: (measurements as any).error?.message
    };

    results.patient_treatment_areas = {
      count: (treatmentAreas as any).data?.length || 0,
      data: (treatmentAreas as any).data,
      error: (treatmentAreas as any).error?.message
    };

    results.patient_treatment_preferences = {
      count: (treatmentPrefs as any).data?.length || 0,
      data: (treatmentPrefs as any).data,
      error: (treatmentPrefs as any).error?.message
    };

    results.patient_intake_photos = {
      count: (photos as any).data?.length || 0,
      data: (photos as any).data,
      error: (photos as any).error?.message
    };

    // Also check by submission_id if we have submissions
    if (submissions.data && submissions.data.length > 0) {
      const subId = submissions.data[0].id;
      results.submission_id_used = subId;

      const [healthBySub, prefsBySub] = await Promise.all([
        supabaseAdmin.from("patient_health_background").select("*").eq("submission_id", subId),
        supabaseAdmin.from("patient_intake_preferences").select("*").eq("submission_id", subId),
      ]);

      results.health_by_submission_id = {
        count: healthBySub.data?.length || 0,
        data: healthBySub.data,
        error: healthBySub.error?.message
      };

      results.prefs_by_submission_id = {
        count: prefsBySub.data?.length || 0,
        data: prefsBySub.data,
        error: prefsBySub.error?.message
      };
    }

    return NextResponse.json({
      success: true,
      patient_id: pid,
      results
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}
