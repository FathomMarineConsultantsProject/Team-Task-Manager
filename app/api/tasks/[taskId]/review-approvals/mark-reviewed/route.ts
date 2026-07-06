import { getAuthenticatedUser, json } from "../../../reviewWorkflow";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

type ReviewRow = {
  id: string;
  status: string | null;
  reviewed_at: string | null;
};

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const { taskId } = await params;
    if (!taskId) {
      return json({ error: "Task id is required." }, 400);
    }

    const { user, adminClient } = await getAuthenticatedUser(req);
    if (!user) {
      return json({ error: "You must be signed in to mark review complete." }, 401);
    }

    const { data: task, error: taskError } = await adminClient
      .from("tasks")
      .select("id, project_id, status")
      .eq("id", taskId)
      .single();

    const typedTask = task as { id: string; project_id: string; status: string | null } | null;
    if (taskError || !typedTask) {
      return json({ error: "Task not found." }, 404);
    }

    if (typedTask.status !== "in_review") {
      return json({ error: "Reviews can only be completed while the task is In Review." }, 409);
    }

    const { data: existingReview, error: existingError } = await adminClient
      .from("task_reviewer_reviews")
      .select("id, status, reviewed_at")
      .eq("task_id", taskId)
      .eq("reviewer_id", user.id)
      .maybeSingle();

    const typedReview = existingReview as ReviewRow | null;
    if (existingError) {
      return json({ error: existingError.message }, 500);
    }

    if (!typedReview) {
      return json({ error: "You are not an assigned reviewer for this task review cycle." }, 403);
    }

    if (typedReview.status === "reviewed") {
      return json({ review: typedReview, alreadyReviewed: true });
    }

    const reviewedAt = new Date().toISOString();
    const { data: updatedReview, error: updateError } = await adminClient
      .from("task_reviewer_reviews")
      .update({
        status: "reviewed",
        reviewed_at: reviewedAt,
        updated_at: reviewedAt,
      })
      .eq("task_id", taskId)
      .eq("reviewer_id", user.id)
      .select("id, status, reviewed_at")
      .single();

    if (updateError) {
      return json({ error: updateError.message }, 500);
    }

    await adminClient.from("task_logs").insert([
      {
        task_id: taskId,
        action: "review_completed",
        from_status: null,
        to_status: null,
        user_id: user.id,
      },
    ]);

    return json({ review: updatedReview });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Failed to mark review complete." }, 500);
  }
}
