import { getAuthenticatedUser, jsonNoStore } from "../../reviewWorkflow";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

type CheckpointDto = {
  id: string;
  taskId: string;
  title: string;
  sortOrder: number;
  isCompleted: boolean;
  completedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function rpcErrorStatus(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (code === "22023" || code === "22P02") return 400;
  return 500;
}

function summary(checkpoints: CheckpointDto[]) {
  return {
    checkpointCount: checkpoints.length,
    completedCheckpointCount: checkpoints.filter((checkpoint) => checkpoint.isCompleted).length,
  };
}

export async function GET(req: Request, { params }: RouteContext) {
  try {
    const { taskId } = await params;
    if (!UUID_PATTERN.test(taskId)) return jsonNoStore({ error: "Valid task id is required." }, 400);

    const { user, adminClient } = await getAuthenticatedUser(req);
    if (!user) return jsonNoStore({ error: "You must be signed in to view checkpoints." }, 401);

    const { data, error } = await adminClient.rpc("get_task_checkpoints", {
      p_task_id: taskId,
      p_actor_id: user.id,
    });
    if (error) return jsonNoStore({ error: error.message }, rpcErrorStatus(error.code));

    const checkpoints = (Array.isArray(data) ? data : []) as CheckpointDto[];
    return jsonNoStore({ checkpoints, ...summary(checkpoints) });
  } catch (error) {
    return jsonNoStore({ error: error instanceof Error ? error.message : "Failed to load checkpoints." }, 500);
  }
}

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const { taskId } = await params;
    if (!UUID_PATTERN.test(taskId)) return jsonNoStore({ error: "Valid task id is required." }, 400);

    const body = (await req.json().catch(() => ({}))) as { title?: string };
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return jsonNoStore({ error: "Checkpoint title is required." }, 400);
    if (title.length > 240) return jsonNoStore({ error: "Checkpoint title must be 240 characters or less." }, 400);

    const { user, adminClient } = await getAuthenticatedUser(req);
    if (!user) return jsonNoStore({ error: "You must be signed in to create checkpoints." }, 401);

    const { data, error } = await adminClient.rpc("create_task_checkpoint", {
      p_task_id: taskId,
      p_actor_id: user.id,
      p_title: title,
    });
    if (error) return jsonNoStore({ error: error.message }, rpcErrorStatus(error.code));

    return jsonNoStore({ checkpoint: data as CheckpointDto }, 201);
  } catch (error) {
    return jsonNoStore({ error: error instanceof Error ? error.message : "Failed to create checkpoint." }, 500);
  }
}
