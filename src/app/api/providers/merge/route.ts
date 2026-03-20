import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type MergeRequest = {
  primaryUserId: string;
  userIdsToMerge: string[];
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MergeRequest;
    const { primaryUserId, userIdsToMerge } = body;

    if (!primaryUserId || !userIdsToMerge || userIdsToMerge.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`Merging ${userIdsToMerge.length} users into primary user ${primaryUserId}`);

    // Transfer all related data from duplicate users to primary
    for (const userId of userIdsToMerge) {
      console.log(`Merging data from user ${userId} to ${primaryUserId}`);

      // Update appointments where user is the provider
      const { error: appointmentsError } = await supabase
        .from("appointments")
        .update({ provider_id: primaryUserId })
        .eq("provider_id", userId);

      if (appointmentsError) {
        console.error("Error merging appointments (provider):", appointmentsError);
      }

      // Update consultations where user is the doctor
      const { error: consultationsError } = await supabase
        .from("consultations")
        .update({ doctor_user_id: primaryUserId })
        .eq("doctor_user_id", userId);

      if (consultationsError) {
        console.error("Error merging consultations (doctor):", consultationsError);
      }

      // Update consultations where user is the creator
      const { error: consultationsCreatedError } = await supabase
        .from("consultations")
        .update({ created_by_user_id: primaryUserId })
        .eq("created_by_user_id", userId);

      if (consultationsCreatedError) {
        console.error("Error merging consultations (created_by):", consultationsCreatedError);
      }

      // Update tasks where user is the assignee
      const { error: tasksError } = await supabase
        .from("tasks")
        .update({ assigned_user_id: primaryUserId })
        .eq("assigned_user_id", userId);

      if (tasksError) {
        console.error("Error merging tasks:", tasksError);
      }

      // Update deals where user is the owner
      const { error: dealsError } = await supabase
        .from("deals")
        .update({ owner_id: primaryUserId })
        .eq("owner_id", userId);

      if (dealsError) {
        console.error("Error merging deals:", dealsError);
      }

      // Update patients where user is the created_by
      const { error: patientsError } = await supabase
        .from("patients")
        .update({ created_by_user_id: primaryUserId })
        .eq("created_by_user_id", userId);

      if (patientsError) {
        console.error("Error merging patients:", patientsError);
      }
    }

    // Delete the merged users
    const { error: deleteError } = await supabase
      .from("users")
      .delete()
      .in("id", userIdsToMerge);

    if (deleteError) {
      console.error("Error deleting merged users:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete merged users", details: deleteError.message },
        { status: 500 }
      );
    }

    console.log(`Successfully merged ${userIdsToMerge.length} users into ${primaryUserId}`);

    return NextResponse.json({
      success: true,
      primaryUserId,
      mergedCount: userIdsToMerge.length,
    });
  } catch (error) {
    console.error("Error merging users:", error);
    return NextResponse.json(
      { error: "Failed to merge users", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
