import { getAuthenticatedUser, jsonNoStore } from "../../../reviewWorkflow";

type RouteContext = {
  params: Promise<{ taskId: string; checkpointId: string }>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function rpcErrorStatus(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (code === "22023" || code === "22P02") return 400;
  return 500;
}

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const { taskId, checkpointId } = await params;
    if (!UUID_PATTERN.test(taskId) || !UUID_PATTERN.test(checkpointId)) {
      return jsonNoStore({ error: "Valid task and checkpoint ids are required." }, 400);
    }

    const body = (await req.json().catch(() => ({}))) as { title?: string; isCompleted?: boolean };
    const hasTitle = Object.prototype.hasOwnProperty.call(body, "title");
    const hasCompletion = Object.prototype.hasOwnProperty.call(body, "isCompleted");
    if (!hasTitle && !hasCompletion) {
      return jsonNoStore({ error: "Nothing to update." }, 400);
    }

    const title = hasTitle ? (typeof body.title === "string" ? body.title.trim() : "") : null;
    if (hasTitle && !title) return jsonNoStore({ error: "Checkpoint title is required." }, 400);
    if (title && title.length > 240) return jsonNoStore({ error: "Checkpoint title must be 240 characters or less." }, 400);

    const isCompleted = hasCompletion ? Boolean(body.isCompleted) : null;

    const { user, adminClient } = await getAuthenticatedUser(req);
    if (!user) return jsonNoStore({ error: "You must be signed in to update checkpoints." }, 401);

    const { data, error } = await adminClient.rpc("update_task_checkpoint", {
      p_checkpoint_id: checkpointId,
      p_actor_id: user.id,
      p_title: title,
      p_is_completed: isCompleted,
    });
    if (error) return jsonNoStore({ error: error.message }, rpcErrorStatus(error.code));

    return jsonNoStore({ checkpoint: data });
  } catch (error) {
    return jsonNoStore({ error: error instanceof Error ? error.message : "Failed to update checkpoint." }, 500);
  }
}

export async function DELETE(req: Request, { params }: RouteContext) {
  try {
    const { taskId, checkpointId } = await params;
    if (!UUID_PATTERN.test(taskId) || !UUID_PATTERN.test(checkpointId)) {
      return jsonNoStore({ error: "Valid task and checkpoint ids are required." }, 400);
    }

    const { user, adminClient } = await getAuthenticatedUser(req);
    if (!user) return jsonNoStore({ error: "You must be signed in to delete checkpoints." }, 401);

    const { data, error } = await adminClient.rpc("delete_task_checkpoint", {
      p_checkpoint_id: checkpointId,
      p_actor_id: user.id,
    });
    if (error) return jsonNoStore({ error: error.message }, rpcErrorStatus(error.code));

    return jsonNoStore(data ?? { ok: true });
  } catch (error) {
    return jsonNoStore({ error: error instanceof Error ? error.message : "Failed to delete checkpoint." }, 500);
  }
}
