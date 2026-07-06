import { getAuthenticatedUser, json } from "../../reviewWorkflow";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

type ReviewRow = {
  id: string;
  reviewer_id: string;
  status: string | null;
  reviewed_at: string | null;
  reviewer:
    | { id: string; name: string | null; email: string | null }
    | { id: string; name: string | null; email: string | null }[]
    | null;
};

export async function GET(req: Request, { params }: RouteContext) {
  try {
    const { taskId } = await params;
    if (!taskId) {
      return json({ error: "Task id is required." }, 400);
    }

    const { user, adminClient } = await getAuthenticatedUser(req);
    if (!user) {
      return json({ error: "You must be signed in to view review approvals." }, 401);
    }

    const { data: task, error: taskError } = await adminClient
      .from("tasks")
      .select("id, project_id")
      .eq("id", taskId)
      .single();

    if (taskError || !task) {
      return json({ error: "Task not found." }, 404);
    }

    const { data, error } = await adminClient
      .from("task_reviewer_reviews")
      .select("id, reviewer_id, status, reviewed_at, reviewer:users!task_reviewer_reviews_reviewer_id_fkey(id, name, email)")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });

    if (error) {
      return json({ error: error.message }, 500);
    }

    const rows = ((data as ReviewRow[] | null) ?? []).map((row) => {
      const reviewer = Array.isArray(row.reviewer) ? row.reviewer[0] ?? null : row.reviewer;
      return {
        id: row.id,
        reviewerId: row.reviewer_id,
        reviewerName: reviewer?.name || reviewer?.email || "Unknown",
        status: row.status ?? "pending",
        reviewedAt: row.reviewed_at,
      };
    });

    return json({
      reviews: rows,
      currentUserReviewerId: rows.some((row) => row.reviewerId === user.id) ? user.id : null,
      reviewedCount: rows.filter((row) => row.status === "reviewed").length,
      totalCount: rows.length,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Failed to load review approvals." }, 500);
  }
}
