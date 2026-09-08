import { isDateOnly } from "@/lib/projectDateTime";
import {
  getAuthenticatedUser,
  isTaskStatus,
  jsonNoStore,
} from "../../../tasks/reviewWorkflow";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

type CreateTaskRequest = {
  title?: string;
  description?: string | null;
  status?: string;
  priority?: string | null;
  columnId?: string | null;
  primaryAssigneeId?: string | null;
  additionalAssigneeIds?: string[];
  workingDates?: string[];
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function rpcErrorStatus(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (code === "P0003" || code === "23505") return 409;
  if (code === "22023" || code === "22P02") return 400;
  return 500;
}

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const { projectId } = await params;
    if (!UUID_PATTERN.test(projectId)) {
      return jsonNoStore({ error: "Valid project id is required." }, 400);
    }

    const body = (await req.json()) as CreateTaskRequest;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const status = body.status ?? "todo";
    const primaryAssigneeId = body.primaryAssigneeId ?? null;
    const additionalAssigneeIds = body.additionalAssigneeIds ?? [];

    if (!title) return jsonNoStore({ error: "Task title is required." }, 400);
    if (!isTaskStatus(status)) return jsonNoStore({ error: "Valid task status is required." }, 400);
    if (primaryAssigneeId !== null && !UUID_PATTERN.test(primaryAssigneeId)) {
      return jsonNoStore({ error: "primaryAssigneeId must be a valid user id or null." }, 400);
    }
    if (
      !Array.isArray(additionalAssigneeIds)
      || additionalAssigneeIds.some((id) => typeof id !== "string" || !UUID_PATTERN.test(id))
    ) {
      return jsonNoStore({ error: "additionalAssigneeIds must contain valid user ids." }, 400);
    }
    if (
      !Array.isArray(body.workingDates)
      || body.workingDates.length === 0
      || body.workingDates.length > 366
      || body.workingDates.some((date) => !isDateOnly(date))
    ) {
      return jsonNoStore({ error: "workingDates must contain 1 to 366 valid YYYY-MM-DD dates." }, 400);
    }

    const { user, adminClient } = await getAuthenticatedUser(req);
    if (!user) return jsonNoStore({ error: "You must be signed in to create tasks." }, 401);

    const { data, error } = await adminClient.rpc("create_task_with_derived_schedule", {
      p_project_id: projectId,
      p_title: title,
      p_actor_id: user.id,
      p_description: typeof body.description === "string" ? body.description : null,
      p_status: status,
      p_priority: typeof body.priority === "string" ? body.priority : null,
      p_primary_assignee_id: primaryAssigneeId,
      p_additional_assignee_ids: [...new Set(additionalAssigneeIds)],
      p_working_dates: [...new Set(body.workingDates)],
    });

    if (error) return jsonNoStore({ error: error.message }, rpcErrorStatus(error.code));

    const taskResult = data as { task?: { id?: string; column_id?: string | null } } | null;
    if (taskResult?.task?.id && body.columnId && UUID_PATTERN.test(body.columnId)) {
      await adminClient
        .from("tasks")
        .update({ column_id: body.columnId })
        .eq("id", taskResult.task.id);
      taskResult.task.column_id = body.columnId;
    }

    return jsonNoStore(data, 201);
  } catch (error) {
    return jsonNoStore({ error: error instanceof Error ? error.message : "Failed to create task." }, 500);
  }
}
