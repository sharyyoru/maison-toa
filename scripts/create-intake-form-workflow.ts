import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const APPOINTMENT_SET_STAGE_ID = "d0c17653-c425-50a5-a42c-151f8625fd1d";

const emailBody = `
<div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #1e293b; margin: 0; font-size: 24px;">Aesthetics Clinic</h1>
  </div>
  
  <p style="color: #334155; font-size: 16px; line-height: 1.6;">Dear {{patient.first_name}},</p>
  
  <p style="color: #334155; font-size: 16px; line-height: 1.6;">
    Thank you for scheduling your consultation with Aesthetics Clinic. We are excited to meet you and help you achieve your aesthetic goals!
  </p>
  
  <p style="color: #334155; font-size: 16px; line-height: 1.6;">
    To ensure we make the most of your appointment, please take a few minutes to complete our <strong>Pre-Consultation Form</strong> before your visit:
  </p>
  
  <div style="text-align: center; margin: 32px 0;">
    <a href="https://aestheticclinic.vercel.app/intake" 
       style="display: inline-block; background-color: #0ea5e9; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
      Complete Pre-Consultation Form
    </a>
  </div>
  
  <div style="background-color: #f1f5f9; border-radius: 8px; padding: 16px; margin: 24px 0;">
    <p style="color: #475569; font-size: 14px; line-height: 1.5; margin: 0;">
      <strong>Why is this form important?</strong><br/>
      This form helps us understand your goals, medical history, and any specific concerns you may have. It allows our specialists to prepare personalized recommendations tailored specifically for you.
    </p>
  </div>
  
  <p style="color: #334155; font-size: 16px; line-height: 1.6;">
    If you have any questions before your appointment, please don't hesitate to reach out to our team.
  </p>
  
  <p style="color: #334155; font-size: 16px; line-height: 1.6;">
    We look forward to seeing you soon!
  </p>
  
  <p style="color: #334155; font-size: 16px; line-height: 1.6; margin-top: 32px;">
    Warm regards,<br/>
    <strong>The Aesthetics Clinic Team</strong>
  </p>
  
  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;" />
  
  <p style="color: #94a3b8; font-size: 12px; text-align: center;">
    Aesthetics Clinic | Your journey to confidence starts here
  </p>
</div>
`.trim();

const workflowConfig = {
  to_stage_id: APPOINTMENT_SET_STAGE_ID,
  nodes: [
    {
      id: "trigger_intake_form",
      type: "trigger",
      data: {
        triggerType: "deal_stage_changed",
        config: {
          to_stage_id: APPOINTMENT_SET_STAGE_ID,
        },
      },
      nextNodeId: "action_send_intake_email",
    },
    {
      id: "action_send_intake_email",
      type: "action",
      data: {
        actionType: "send_email",
        config: {
          recipient: "patient",
          subject: "Your Pre-Consultation Form - Aesthetics Clinic",
          body: emailBody,
        },
      },
    },
  ],
};

async function createWorkflow() {
  console.log("Creating 'Send Intake Form' workflow for Appointment Set stage...");

  // Check if workflow already exists
  const { data: existing } = await supabase
    .from("workflows")
    .select("id, name")
    .eq("name", "Send Intake Form")
    .single();

  if (existing) {
    console.log("Workflow already exists. Updating...");
    const { data, error } = await supabase
      .from("workflows")
      .update({
        trigger_type: "deal_stage_changed",
        active: true,
        config: workflowConfig,
      })
      .eq("id", existing.id)
      .select()
      .single();

    if (error) {
      console.error("Error updating workflow:", error);
      process.exit(1);
    }

    console.log("Workflow updated successfully!");
    console.log("Workflow ID:", data.id);
  } else {
    console.log("Creating new workflow...");
    const { data, error } = await supabase
      .from("workflows")
      .insert({
        name: "Send Intake Form",
        trigger_type: "deal_stage_changed",
        active: true,
        config: workflowConfig,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating workflow:", error);
      process.exit(1);
    }

    console.log("Workflow created successfully!");
    console.log("Workflow ID:", data.id);
  }

  console.log("\nWorkflow Details:");
  console.log("- Name: Send Intake Form");
  console.log("- Trigger: Deal stage changed to 'Appointment Set'");
  console.log("- Action: Send professional email with intake form link");
  console.log("- Form URL: https://aestheticclinic.vercel.app/intake");
}

createWorkflow().catch(console.error);
