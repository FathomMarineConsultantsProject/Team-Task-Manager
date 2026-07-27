import { isDateOnly } from "@/lib/projectDateTime";
import { getAuthenticatedUser, jsonNoStore } from "../../reviewWorkflow";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

type UpdateWorkingDatesRequest = {
  dates?: string[];
  reason?: string;
  title?: string;
  description?: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function rpcErrorStatus(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (code === "P0003" || code === "23505") return 409;
  if (code === "22023" || code === "22P02") return 400;
  return 500;
}

export async function GET(req: Request, { params }: RouteContext) {
  try {
    const { taskId } = await params;
    if (!UUID_PATTERN.test(taskId)) return jsonNoStore({ error: "Valid task id is required." }, 400);

    const { user, adminClient } = await getAuthenticatedUser(req);
    if (!user) return jsonNoStore({ error: "You must be signed in to view task working dates." }, 401);

    const { data, error } = await adminClient.rpc("get_task_working_schedule", {
      p_task_id: taskId,
      p_actor_id: user.id,
    });
    if (error) return jsonNoStore({ error: error.message }, rpcErrorStatus(error.code));
    return jsonNoStore(data);
  } catch (error) {
    return jsonNoStore({ error: error instanceof Error ? error.message : "Failed to load task working dates." }, 500);
  }
}

export async function PUT(req: Request, { params }: RouteContext) {
  try {
    const { taskId } = await params;
    if (!UUID_PATTERN.test(taskId)) return jsonNoStore({ error: "Valid task id is required." }, 400);

    const body = (await req.json()) as UpdateWorkingDatesRequest;
    if (
      !Array.isArray(body.dates)
      || body.dates.length === 0
      || body.dates.length > 366
      || body.dates.some((date) => !isDateOnly(date))
    ) {
      return jsonNoStore({ error: "dates must contain 1 to 366 valid YYYY-MM-DD values." }, 400);
    }

    const { user, adminClient } = await getAuthenticatedUser(req);
    if (!user) return jsonNoStore({ error: "You must be signed in to update task working dates." }, 401);

    const { data, error } = await adminClient.rpc("replace_task_working_dates_and_boundaries", {
      p_task_id: taskId,
      p_dates: [...new Set(body.dates)],
      p_actor_id: user.id,
      p_reason: typeof body.reason === "string" ? body.reason : null,
    });
    if (error) return jsonNoStore({ error: error.message }, rpcErrorStatus(error.code));
    return jsonNoStore(data);
  } catch (error) {
    return jsonNoStore({ error: error instanceof Error ? error.message : "Failed to update task working dates." }, 500);
  }
}

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const { taskId } = await params;
    const body = (await req.json()) as UpdateWorkingDatesRequest;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!UUID_PATTERN.test(taskId)) return jsonNoStore({ error: "Valid task id is required." }, 400);
    if (!title) return jsonNoStore({ error: "Task title is required." }, 400);
    if (
      !Array.isArray(body.dates)
      || body.dates.length === 0
      || body.dates.length > 366
      || body.dates.some((date) => !isDateOnly(date))
    ) {
      return jsonNoStore({ error: "dates must contain 1 to 366 valid YYYY-MM-DD values." }, 400);
    }

    const { user, adminClient } = await getAuthenticatedUser(req);
    if (!user) return jsonNoStore({ error: "You must be signed in to update this task." }, 401);

    const { data, error } = await adminClient.rpc("update_task_with_schedule", {
      p_task_id: taskId,
      p_title: title,
      p_description: typeof body.description === "string" ? body.description : null,
      p_dates: [...new Set(body.dates)],
      p_actor_id: user.id,
      p_reason: typeof body.reason === "string" ? body.reason : null,
    });
    if (error) return jsonNoStore({ error: error.message }, rpcErrorStatus(error.code));
    return jsonNoStore(data);
  } catch (error) {
    return jsonNoStore({ error: error instanceof Error ? error.message : "Failed to update task." }, 500);
  }
}
