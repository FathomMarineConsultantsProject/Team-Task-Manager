import { getAuthenticatedUser, json } from "../../reviewWorkflow";

type RouteContext = { params: Promise<{ taskId: string }> };

type MoveResult = {
  ok: boolean;
  error?: string;
  task?: { id: string; status: string; column_id: string; updated_at: string | null };
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
    const { columnId } = (await req.json().catch(() => ({}))) as { columnId?: string };
    if (!taskId || !columnId) return json({ error: "Task id and destination column are required." }, 400);

    const { user, adminClient } = await getAuthenticatedUser(req);
    if (!user) return json({ error: "You must be signed in to move this task." }, 401);

    const { data, error } = await adminClient.rpc("move_task_to_column", {
      p_task_id: taskId,
      p_column_id: columnId,
      p_actor_id: user.id,
    });
    if (error) return json({ error: error.message }, rpcErrorStatus(error.code));

    const result = data as MoveResult | null;
    if (!result?.ok) return json({ error: result?.error ?? "Task column move was blocked." }, 409);
    return json({ ok: true, task: result.task });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Failed to move task." }, 500);
  }
}
