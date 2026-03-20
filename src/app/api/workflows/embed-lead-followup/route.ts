import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { shouldCreateDeal } from "@/lib/dealDeduplication";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Sales team users who should be assigned tasks for new leads (round-robin)
const SALES_TEAM_NAMES = ["Charline", "Elite", "Audrey", "Bubuque", "Victoria"];

interface EmbedLeadFollowupPayload {
  patient_id: string;
  lead_id: string;
  form_type: string;
  service?: string | null;
  location?: string | null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as EmbedLeadFollowupPayload;
    const { patient_id, lead_id, form_type, service, location } = body;

    if (!patient_id) {
      return NextResponse.json(
        { error: "patient_id is required" },
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get patient details
    const { data: patient, error: patientError } = await supabaseAdmin
      .from("patients")
      .select("*")
      .eq("id", patient_id)
      .single();

    if (patientError || !patient) {
      return NextResponse.json(
        { error: "Patient not found" },
        { status: 404 }
      );
    }

    let actionsRun = 0;
    let dealCreated = false;
    let taskCreated = false;

    // ========================================
    // AUTO-CREATE DEAL UNDER "REQUEST FOR INFORMATION"
    // ========================================
    
    // Check if patient already has a recent deal (within 6 hours) to avoid duplicates
    const dealCheck = await shouldCreateDeal(supabaseAdmin, {
      patientId: patient_id,
    });

    if (dealCheck.shouldCreate) {
      // Get "Request for Information" stage
      const { data: requestStage } = await supabaseAdmin
        .from("deal_stages")
        .select("id, name")
        .ilike("name", "%request for information%")
        .limit(1)
        .single();

      if (requestStage) {
        // Build deal title with service if available
        const dealTitle = service 
          ? `${patient.first_name} ${patient.last_name} - ${service}`
          : `${patient.first_name} ${patient.last_name} - Embed Form Inquiry`;

        // Build notes with all available info
        const noteParts = [
          `Auto-created from ${form_type} embed form on ${new Date().toLocaleDateString()}`,
        ];
        if (service) noteParts.push(`Service Interest: ${service}`);
        if (location) noteParts.push(`Preferred Location: ${location}`);

        // Create new deal
        const { data: newDeal, error: dealError } = await supabaseAdmin
          .from("deals")
          .insert({
            patient_id: patient_id,
            stage_id: requestStage.id,
            title: dealTitle,
            pipeline: "sales",
            notes: noteParts.join("\n"),
          })
          .select("id")
          .single();

        if (!dealError && newDeal) {
          dealCreated = true;
          actionsRun += 1;
          console.log(`Created deal for existing patient ${patient_id} from embed form`);

          // Update the lead with deal ID
          if (lead_id) {
            await supabaseAdmin
              .from("embed_form_leads")
              .update({ 
                status: "converted",
                updated_at: new Date().toISOString(),
              })
              .eq("id", lead_id);
          }
        } else {
          console.error("Failed to create deal:", dealError);
        }
      } else {
        console.warn("Could not find 'Request for Information' stage");
      }
    } else {
      console.log(`Skipped deal creation for patient ${patient_id} — recent deal exists`);
    }

    // ========================================
    // AUTO-CREATE TASK FOR SALES TEAM (ROUND-ROBIN)
    // ========================================
    
    // Get sales team users from auth
    const { data: authData } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    
    const salesTeamUsers: Array<{ id: string; name: string }> = [];
    if (authData?.users) {
      for (const user of authData.users) {
        const meta = (user.user_metadata || {}) as Record<string, unknown>;
        const fullName = (meta["full_name"] as string) || 
          ((meta["first_name"] as string) && (meta["last_name"] as string) 
            ? `${meta["first_name"]} ${meta["last_name"]}` : null) ||
          (meta["first_name"] as string) || "";
        
        // Check if user name matches any sales team member
        const matchesSalesTeam = SALES_TEAM_NAMES.some(name => 
          fullName.toLowerCase().includes(name.toLowerCase())
        );
        
        if (matchesSalesTeam) {
          salesTeamUsers.push({ id: user.id, name: fullName });
        }
      }
    }

    if (salesTeamUsers.length > 0) {
      // Round-robin: Get count of recent tasks to determine next assignee
      const { count: taskCount } = await supabaseAdmin
        .from("tasks")
        .select("*", { count: "exact", head: true })
        .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()); // Last 30 days

      const assigneeIndex = (taskCount || 0) % salesTeamUsers.length;
      const assignee = salesTeamUsers[assigneeIndex];

      // Create task
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 1); // Due tomorrow

      // Build task content
      const contentParts = [
        `Existing patient submitted ${form_type} embed form.`,
        `Please follow up with ${patient.first_name} ${patient.last_name}.`,
        "",
        `Email: ${patient.email || 'N/A'}`,
        `Phone: ${patient.phone || 'N/A'}`,
      ];
      if (service) contentParts.push(`Service Interest: ${service}`);
      if (location) contentParts.push(`Preferred Location: ${location}`);

      const { error: taskError } = await supabaseAdmin
        .from("tasks")
        .insert({
          name: `Follow up: ${patient.first_name} ${patient.last_name} (${form_type} form)`,
          content: contentParts.join("\n"),
          status: "not_started",
          priority: "high",
          type: "call",
          activity_date: dueDate.toISOString(),
          assigned_user_id: assignee.id,
          assigned_user_name: assignee.name,
          patient_id: patient_id,
          created_by_name: "System",
        });

      if (!taskError) {
        taskCreated = true;
        actionsRun += 1;
        console.log(`Created task for existing patient ${patient_id}, assigned to ${assignee.name}`);
      } else {
        console.error("Failed to create task:", taskError);
      }
    } else {
      console.warn("No sales team users found matching:", SALES_TEAM_NAMES);
    }

    return NextResponse.json({
      ok: true,
      actionsRun,
      dealCreated,
      taskCreated,
    });
  } catch (error) {
    console.error("Error in embed-lead-followup workflow:", error);
    return NextResponse.json(
      { error: "Unexpected error running workflow" },
      { status: 500 }
    );
  }
}
