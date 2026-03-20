import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { workflowId, newName } = body as {
      workflowId?: string;
      newName?: string;
    };

    if (!workflowId) {
      return NextResponse.json(
        { error: "Missing required field: workflowId" },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the original workflow
    const { data: originalWorkflow, error: workflowError } = await supabase
      .from("workflows")
      .select("*")
      .eq("id", workflowId)
      .single();

    if (workflowError || !originalWorkflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 }
      );
    }

    // Get the original workflow actions
    const { data: originalActions, error: actionsError } = await supabase
      .from("workflow_actions")
      .select("*")
      .eq("workflow_id", workflowId)
      .order("sort_order", { ascending: true });

    if (actionsError) {
      return NextResponse.json(
        { error: "Failed to fetch workflow actions" },
        { status: 500 }
      );
    }

    // Create the duplicated workflow
    const duplicatedName = newName || `${originalWorkflow.name} (Copy)`;
    
    const { data: newWorkflow, error: insertError } = await supabase
      .from("workflows")
      .insert({
        name: duplicatedName,
        trigger_type: originalWorkflow.trigger_type,
        active: false, // Start as inactive
        config: originalWorkflow.config,
      })
      .select("id, name")
      .single();

    if (insertError || !newWorkflow) {
      return NextResponse.json(
        { error: "Failed to create duplicated workflow", details: insertError?.message },
        { status: 500 }
      );
    }

    // Duplicate the actions
    if (originalActions && originalActions.length > 0) {
      const duplicatedActions = originalActions.map((action: any) => ({
        workflow_id: newWorkflow.id,
        action_type: action.action_type,
        config: action.config,
        sort_order: action.sort_order,
      }));

      const { error: actionsInsertError } = await supabase
        .from("workflow_actions")
        .insert(duplicatedActions);

      if (actionsInsertError) {
        // Rollback: delete the created workflow
        await supabase.from("workflows").delete().eq("id", newWorkflow.id);
        
        return NextResponse.json(
          { error: "Failed to duplicate workflow actions", details: actionsInsertError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      workflow: {
        id: newWorkflow.id,
        name: newWorkflow.name,
      },
      message: "Workflow duplicated successfully",
    });
  } catch (error) {
    console.error("Error duplicating workflow:", error);
    return NextResponse.json(
      { error: "Failed to duplicate workflow", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
