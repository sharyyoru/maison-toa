import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { MediDataClient } from "@/lib/medidataClient";

type MediDataConfigRow = {
  medidata_endpoint_url: string | null;
  medidata_client_id: string | null;
  medidata_username: string | null;
  medidata_password_encrypted: string | null;
  is_test_mode: boolean;
};

/**
 * GET /api/medidata/status?submissionId=xxx
 * Poll the status of a MediData submission
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const submissionId = searchParams.get("submissionId");

    if (!submissionId) {
      return NextResponse.json(
        { error: "submissionId is required" },
        { status: 400 }
      );
    }

    // Get submission record
    const { data: submission, error: subError } = await supabaseAdmin
      .from("medidata_submissions")
      .select("*")
      .eq("id", submissionId)
      .single();

    if (subError || !submission) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 }
      );
    }

    // If no message ID, return current status from DB
    if (!submission.medidata_message_id) {
      return NextResponse.json({
        submissionId,
        status: submission.status,
        statusMessage: "Not yet transmitted to MediData",
        lastChecked: null,
        history: [],
      });
    }

    // Get MediData config
    const { data: configData } = await supabaseAdmin
      .from("medidata_config")
      .select("medidata_endpoint_url, medidata_client_id, medidata_username, medidata_password_encrypted, is_test_mode")
      .limit(1)
      .single();

    const config = configData as MediDataConfigRow | null;

    if (!config?.medidata_endpoint_url || !config?.medidata_client_id || 
        !config?.medidata_username || !config?.medidata_password_encrypted) {
      return NextResponse.json({
        submissionId,
        status: submission.status,
        statusMessage: "MediData not configured - cannot poll status",
        lastChecked: null,
        history: [],
      });
    }

    // Create MediData client and poll status
    const medidataClient = new MediDataClient({
      baseUrl: config.medidata_endpoint_url,
      clientId: config.medidata_client_id,
      username: config.medidata_username,
      password: config.medidata_password_encrypted,
      isTestMode: config.is_test_mode,
    });

    const statusResult = await medidataClient.getTransmissionStatus(submission.medidata_message_id);

    // Map MediData status to our status
    let newStatus = submission.status;
    if (statusResult.status === "transmitted") {
      newStatus = "transmitted";
    } else if (statusResult.status === "delivered") {
      newStatus = "delivered";
    } else if (statusResult.status === "accepted") {
      newStatus = "accepted";
    } else if (statusResult.status === "rejected") {
      newStatus = "rejected";
    }

    // Update status if changed
    if (newStatus !== submission.status) {
      await supabaseAdmin
        .from("medidata_submissions")
        .update({
          status: newStatus,
          medidata_response_code: statusResult.statusCode,
          medidata_response_message: statusResult.statusMessage,
          updated_at: new Date().toISOString(),
        })
        .eq("id", submissionId);

      // Record status change in history
      await supabaseAdmin.from("medidata_submission_history").insert({
        submission_id: submissionId,
        previous_status: submission.status,
        new_status: newStatus,
        response_code: statusResult.statusCode,
        changed_by: null,
        notes: statusResult.statusMessage || `Status updated to ${newStatus}`,
      });
    }

    // Get history
    const { data: history } = await supabaseAdmin
      .from("medidata_submission_history")
      .select("*")
      .eq("submission_id", submissionId)
      .order("created_at", { ascending: false })
      .limit(10);

    return NextResponse.json({
      submissionId,
      messageId: submission.medidata_message_id,
      status: newStatus,
      statusCode: statusResult.statusCode,
      statusMessage: statusResult.statusMessage,
      lastChecked: new Date().toISOString(),
      history: history || [],
    });
  } catch (error) {
    console.error("Error polling MediData status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/medidata/status
 * Manually trigger status refresh for multiple submissions
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { submissionIds } = body;

    if (!submissionIds || !Array.isArray(submissionIds) || submissionIds.length === 0) {
      return NextResponse.json(
        { error: "submissionIds array is required" },
        { status: 400 }
      );
    }

    // Limit batch size
    const idsToProcess = submissionIds.slice(0, 20);

    // Get MediData config
    const { data: configData } = await supabaseAdmin
      .from("medidata_config")
      .select("medidata_endpoint_url, medidata_client_id, medidata_username, medidata_password_encrypted, is_test_mode")
      .limit(1)
      .single();

    const config = configData as MediDataConfigRow | null;

    if (!config?.medidata_endpoint_url || !config?.medidata_client_id || 
        !config?.medidata_username || !config?.medidata_password_encrypted) {
      return NextResponse.json(
        { error: "MediData not configured" },
        { status: 400 }
      );
    }

    // Create MediData client
    const medidataClient = new MediDataClient({
      baseUrl: config.medidata_endpoint_url,
      clientId: config.medidata_client_id,
      username: config.medidata_username,
      password: config.medidata_password_encrypted,
      isTestMode: config.is_test_mode,
    });

    // Get submissions
    const { data: submissions } = await supabaseAdmin
      .from("medidata_submissions")
      .select("id, medidata_message_id, status")
      .in("id", idsToProcess)
      .not("medidata_message_id", "is", null);

    const results: Array<{
      submissionId: string;
      previousStatus: string;
      newStatus: string;
      updated: boolean;
    }> = [];

    for (const sub of submissions || []) {
      if (!sub.medidata_message_id) continue;

      try {
        const statusResult = await medidataClient.getTransmissionStatus(sub.medidata_message_id);

        let newStatus = sub.status;
        if (statusResult.status === "transmitted") newStatus = "transmitted";
        else if (statusResult.status === "delivered") newStatus = "delivered";
        else if (statusResult.status === "accepted") newStatus = "accepted";
        else if (statusResult.status === "rejected") newStatus = "rejected";

        const updated = newStatus !== sub.status;

        if (updated) {
          await supabaseAdmin
            .from("medidata_submissions")
            .update({
              status: newStatus,
              medidata_response_code: statusResult.statusCode,
              medidata_response_message: statusResult.statusMessage,
              updated_at: new Date().toISOString(),
            })
            .eq("id", sub.id);

          await supabaseAdmin.from("medidata_submission_history").insert({
            submission_id: sub.id,
            previous_status: sub.status,
            new_status: newStatus,
            response_code: statusResult.statusCode,
            changed_by: null,
            notes: `Batch status update: ${statusResult.statusMessage || newStatus}`,
          });
        }

        results.push({
          submissionId: sub.id,
          previousStatus: sub.status,
          newStatus,
          updated,
        });
      } catch (error) {
        console.error(`Error polling status for ${sub.id}:`, error);
        results.push({
          submissionId: sub.id,
          previousStatus: sub.status,
          newStatus: sub.status,
          updated: false,
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      updated: results.filter((r) => r.updated).length,
      results,
    });
  } catch (error) {
    console.error("Error in batch status poll:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
