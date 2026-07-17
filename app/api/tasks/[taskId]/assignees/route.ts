import { getAuthenticatedUser, json } from "../../reviewWorkflow";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

type AssigneeRequest = {
  primaryAssigneeId?: string | null;
  additionalAssigneeIds?: string[];
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function rpcErrorStatus(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (code === "22023" || code === "22P02") return 400;
  return 500;
}

export async function PUT(req: Request, { params }: RouteContext) {
  try {
    const { taskId } = await params;
    if (!taskId) {
      return json({ error: "Task id is required." }, 400);
    }

    const body = (await req.json()) as AssigneeRequest;
    const primaryAssigneeId = body.primaryAssigneeId ?? null;
    const additionalAssigneeIds = body.additionalAssigneeIds ?? [];

    if (primaryAssigneeId !== null && (!UUID_PATTERN.test(primaryAssigneeId))) {
      return json({ error: "primaryAssigneeId must be a valid user id or null." }, 400);
    }

    if (!Array.isArray(additionalAssigneeIds) || additionalAssigneeIds.some((id) => typeof id !== "string" || !UUID_PATTERN.test(id))) {
      return json({ error: "additionalAssigneeIds must contain valid user ids." }, 400);
    }

    const { user, adminClient } = await getAuthenticatedUser(req);
    if (!user) {
      return json({ error: "You must be signed in to update task assignees." }, 401);
    }

    const { data, error } = await adminClient.rpc("replace_task_assignees", {
      p_task_id: taskId,
      p_primary_assignee_id: primaryAssigneeId,
      p_additional_assignee_ids: additionalAssigneeIds,
      p_actor_id: user.id,
    });

    if (error) {
      return json({ error: error.message }, rpcErrorStatus(error.code));
    }

    return json(data ?? { primaryAssigneeId, assignees: [] });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Failed to update task assignees." }, 500);
  }
}
