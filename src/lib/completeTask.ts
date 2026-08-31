import { supabaseClient } from "@/lib/supabaseClient";

export async function completeTask(taskId: string) {
  const { data: sessionData, error: sessionError } =
    await supabaseClient.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  if (sessionError || !accessToken) {
    throw new Error("You must be logged in to complete a task.");
  }

  const response = await fetch(`/api/tasks/${taskId}/complete`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Failed to mark task as complete.");
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("task-status-changed"));
  }

  return payload.task;
}
