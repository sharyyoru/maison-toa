import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { shouldCreateDeal } from "@/lib/dealDeduplication";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Sales team users who should be assigned tasks for new leads (round-robin)
const SALES_TEAM_NAMES = ["Charline", "Elite", "Audrey", "Bubuque", "Victoria"];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { patient_id } = body;

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
        // Create new deal
        const { error: dealError } = await supabaseAdmin
          .from("deals")
          .insert({
            patient_id: patient_id,
            stage_id: requestStage.id,
            title: `${patient.first_name} ${patient.last_name} - New Inquiry`,
            pipeline: "sales",
            notes: `Auto-created from intake form submission on ${new Date().toLocaleDateString()}`,
          });

        if (!dealError) {
          dealCreated = true;
          actionsRun += 1;
          console.log(`Created deal for patient ${patient_id} in stage "${requestStage.name}"`);
        } else {
          console.error("Failed to create deal:", dealError);
        }
      } else {
        console.warn("Could not find 'Request for Information' stage");
      }
    } else {
      console.log(`Skipped deal creation for patient ${patient_id} — recent deal exists: ${dealCheck.existingDeal.id}`);
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

      const { error: taskError } = await supabaseAdmin
        .from("tasks")
        .insert({
          name: `Contact new lead: ${patient.first_name} ${patient.last_name}`,
          content: `New lead from intake form. Please contact ${patient.first_name} ${patient.last_name} to discuss their inquiry.\n\nEmail: ${patient.email || 'N/A'}\nPhone: ${patient.phone || 'N/A'}`,
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
        console.log(`Created task for patient ${patient_id}, assigned to ${assignee.name}`);
      } else {
        console.error("Failed to create task:", taskError);
      }
    } else {
      console.warn("No sales team users found matching:", SALES_TEAM_NAMES);
    }

    // ========================================
    // RUN CONFIGURED WORKFLOWS (if any)
    // ========================================

    // Find workflows with patient_created trigger
    const { data: workflows, error: workflowsError } = await supabaseAdmin
      .from("workflows")
      .select("*")
      .eq("trigger_type", "patient_created")
      .eq("active", true);

    if (workflowsError) {
      console.error("Error fetching workflows:", workflowsError);
    }

    // Process configured workflows if any exist
    if (workflows && workflows.length > 0) {
    for (const workflow of workflows) {
      // Create workflow enrollment record
      const { data: enrollment } = await supabaseAdmin
        .from("workflow_enrollments")
        .insert({
          workflow_id: workflow.id,
          patient_id: patient.id,
          status: "active",
          trigger_data: {
            patient,
            trigger_type: "patient_created",
          },
        })
        .select("id")
        .single();

      const enrollmentId = enrollment?.id;

      // Get workflow actions from config
      const workflowConfig = workflow.config as { nodes?: any[] } | null;
      if (!workflowConfig?.nodes) continue;

      const actions = workflowConfig.nodes.filter(
        (node: any) => node.type === "action"
      );

      for (const actionNode of actions) {
        const actionType = actionNode.data?.actionType;
        const config = actionNode.data?.config || {};

        if (actionType === "create_task") {
          const taskName = config.task_name || `Follow up with ${patient.first_name} ${patient.last_name}`;
          
          const { error: taskError } = await supabaseAdmin
            .from("tasks")
            .insert({
              name: taskName,
              description: config.description || `New patient intake: ${patient.first_name} ${patient.last_name}`,
              status: "open",
              priority: config.priority || "medium",
              type: "todo",
              patient_id: patient.id,
              assigned_user_id: config.user_id || null,
              created_by_name: "System",
            });

          if (!taskError) {
            actionsRun += 1;
            if (enrollmentId) {
              await supabaseAdmin.from("workflow_enrollment_steps").insert({
                enrollment_id: enrollmentId,
                step_type: "action",
                step_action: "create_task",
                step_config: config,
                status: "completed",
                executed_at: new Date().toISOString(),
                result: { task_name: taskName },
              });
            }
          }
        }

        if (actionType === "send_email") {
          // Email sending logic would go here
          // For now, just log the step
          if (enrollmentId) {
            await supabaseAdmin.from("workflow_enrollment_steps").insert({
              enrollment_id: enrollmentId,
              step_type: "action",
              step_action: "send_email",
              step_config: config,
              status: "pending",
              executed_at: new Date().toISOString(),
            });
          }
        }
      }
    }
    } // Close workflows if block

    return NextResponse.json({
      ok: true,
      workflows: workflows?.length || 0,
      actionsRun,
      dealCreated,
      taskCreated,
    });
  } catch (error) {
    console.error("Error in patient-created workflow:", error);
    return NextResponse.json(
      { error: "Unexpected error running workflows" },
      { status: 500 }
    );
  }
}
