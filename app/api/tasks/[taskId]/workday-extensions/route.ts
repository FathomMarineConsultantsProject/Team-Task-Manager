import { isDateOnly, parseTimeOnly } from "@/lib/projectDateTime";
import { getAuthenticatedUser, jsonNoStore } from "../../reviewWorkflow";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

type ExtensionRequest = {
  workDate?: string;
  extendedUntilLocalTime?: string;
  reason?: string;
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
    const workDate = new URL(req.url).searchParams.get("workDate");
    if (!UUID_PATTERN.test(taskId)) return jsonNoStore({ error: "Valid task id is required." }, 400);
    if (!isDateOnly(workDate)) return jsonNoStore({ error: "workDate must use YYYY-MM-DD." }, 400);

    const { user, adminClient } = await getAuthenticatedUser(req);
    if (!user) return jsonNoStore({ error: "You must be signed in to view task extensions." }, 401);

    const { data, error } = await adminClient.rpc("get_task_workday_extension", {
      p_task_id: taskId,
      p_work_date: workDate,
      p_actor_id: user.id,
    });
    if (error) return jsonNoStore({ error: error.message }, rpcErrorStatus(error.code));
    return jsonNoStore(data);
  } catch (error) {
    return jsonNoStore({ error: error instanceof Error ? error.message : "Failed to load task extension." }, 500);
  }
}

export async function PUT(req: Request, { params }: RouteContext) {
  try {
    const { taskId } = await params;
    const body = (await req.json()) as ExtensionRequest;
    if (!UUID_PATTERN.test(taskId)) return jsonNoStore({ error: "Valid task id is required." }, 400);
    if (!isDateOnly(body.workDate)) return jsonNoStore({ error: "workDate must use YYYY-MM-DD." }, 400);
    const extensionTime = parseTimeOnly(body.extendedUntilLocalTime);
    if (!extensionTime) {
      return jsonNoStore({ error: "extendedUntilLocalTime must use HH:MM or HH:MM:SS." }, 400);
    }
    if (extensionTime.hour > 23 || (extensionTime.hour === 23 && (extensionTime.minute > 0 || extensionTime.second > 0))) {
      return jsonNoStore({ error: "Workday extensions cannot exceed four hours after the normal end time." }, 400);
    }

    const { user, adminClient } = await getAuthenticatedUser(req);
    if (!user) return jsonNoStore({ error: "You must be signed in to extend task hours." }, 401);

    const { data, error } = await adminClient.rpc("set_task_workday_extension", {
      p_task_id: taskId,
      p_work_date: body.workDate,
      p_extended_until_local_time: body.extendedUntilLocalTime,
      p_reason: typeof body.reason === "string" ? body.reason : null,
      p_actor_id: user.id,
    });
    if (error) return jsonNoStore({ error: error.message }, rpcErrorStatus(error.code));
    return jsonNoStore(data);
  } catch (error) {
    return jsonNoStore({ error: error instanceof Error ? error.message : "Failed to set task extension." }, 500);
  }
}

export async function DELETE(req: Request, { params }: RouteContext) {
  try {
    const { taskId } = await params;
    const body = (await req.json()) as ExtensionRequest;
    if (!UUID_PATTERN.test(taskId)) return jsonNoStore({ error: "Valid task id is required." }, 400);
    if (!isDateOnly(body.workDate)) return jsonNoStore({ error: "workDate must use YYYY-MM-DD." }, 400);
    if (typeof body.reason !== "string" || !body.reason.trim()) {
      return jsonNoStore({ error: "A cancellation reason is required." }, 400);
    }

    const { user, adminClient } = await getAuthenticatedUser(req);
    if (!user) return jsonNoStore({ error: "You must be signed in to cancel task extensions." }, 401);

    const { data, error } = await adminClient.rpc("cancel_task_workday_extension", {
      p_task_id: taskId,
      p_work_date: body.workDate,
      p_reason: body.reason,
      p_actor_id: user.id,
    });
    if (error) return jsonNoStore({ error: error.message }, rpcErrorStatus(error.code));
    return jsonNoStore(data);
  } catch (error) {
    return jsonNoStore({ error: error instanceof Error ? error.message : "Failed to cancel task extension." }, 500);
  }
}
