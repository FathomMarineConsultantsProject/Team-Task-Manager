import {
  getAuthenticatedUser,
  isTaskStatus,
  json,
} from "../../reviewWorkflow";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

type TransitionResult = {
  ok: boolean;
  error?: string;
  pendingReviewerIds?: string[];
  pendingReviewers?: string[];
  reviewCycleReset?: boolean;
  task?: {
    id: string;
    status: string;
    completed_at: string | null;
    updated_at: string | null;
    draft_review_started_at: string | null;
    draft_review_due_at: string | null;
  };
};

function rpcErrorStatus(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (code === "22023") return 400;
  return 500;
}

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const { taskId } = await params;
    const { status, columnId } = (await req.json()) as { status?: string; columnId?: string };

    if (!taskId) {
      return json({ error: "Task id is required." }, 400);
    }

    if (!status || !isTaskStatus(status)) {
      return json({ error: "Valid task status is required." }, 400);
    }

    const { user, adminClient } = await getAuthenticatedUser(req);
    if (!user) {
      return json({ error: "You must be signed in to update task status." }, 401);
    }

    const rpcRes = await adminClient.rpc("transition_task_status", {
      p_task_id: taskId,
      p_new_status: status,
      p_actor_id: user.id,
      p_column_id: columnId || null,
    });

    const { data, error } = rpcRes;

    if (error) {
      return json({ error: error.message }, rpcErrorStatus(error.code));
    }

    const result = data as TransitionResult | null;
    if (!result) {
      return json({ error: "Task status transition returned no result." }, 500);
    }

    if (!result.ok) {
      return json(
        {
          error: result.error ?? "Task status transition was blocked.",
          pendingReviewerIds: result.pendingReviewerIds ?? [],
          pendingReviewers: result.pendingReviewers ?? [],
        },
        409,
      );
    }

    return json({
      ok: true,
      task: result.task,
      reviewCycleReset: Boolean(result.reviewCycleReset),
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Failed to update task status." }, 500);
  }
}
