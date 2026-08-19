import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: authData, error: authError } =
    await supabaseAdmin.auth.getUser(token);
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { data: task, error: taskError } = await supabaseAdmin
    .from("tasks")
    .select("id, name, status, created_by_user_id, assigned_read_at")
    .eq("id", id)
    .single();

  if (taskError || !task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (task.status !== "completed") {
    const nowIso = new Date().toISOString();
    const { data: updatedTask, error: updateError } = await supabaseAdmin
      .from("tasks")
      .update({
        status: "completed",
        updated_at: nowIso,
        assigned_read_at: task.assigned_read_at ?? nowIso,
      })
      .eq("id", id)
      .neq("status", "completed")
      .select(
        "id, patient_id, name, content, status, priority, type, activity_date, created_at, created_by_user_id, created_by_name, assigned_read_at, assigned_user_id, assigned_user_name",
      )
      .maybeSingle();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (updatedTask) {
      const creatorId = task.created_by_user_id as string | null;
      if (creatorId && creatorId !== authData.user.id) {
        const metadata = authData.user.user_metadata || {};
        const completedBy =
          [metadata.first_name, metadata.last_name].filter(Boolean).join(" ") ||
          authData.user.email ||
          "A user";

        const { data: comment, error: commentError } = await supabaseAdmin
          .from("task_comments")
          .insert({
            task_id: id,
            author_user_id: authData.user.id,
            author_name: completedBy,
            body: `Completed task: ${task.name}`,
          })
          .select("id")
          .single();

        if (!commentError && comment) {
          await supabaseAdmin.from("task_comment_mentions").insert({
            task_comment_id: comment.id,
            task_id: id,
            mentioned_user_id: creatorId,
          });
        } else if (commentError) {
          console.error("Failed to create task completion notification", commentError);
        }
      }

      return NextResponse.json({ task: updatedTask });
    }
  }

  const { data: completedTask, error: completedTaskError } = await supabaseAdmin
    .from("tasks")
    .select(
      "id, patient_id, name, content, status, priority, type, activity_date, created_at, created_by_user_id, created_by_name, assigned_read_at, assigned_user_id, assigned_user_name",
    )
    .eq("id", id)
    .single();

  if (completedTaskError || !completedTask) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({ task: completedTask });
}
