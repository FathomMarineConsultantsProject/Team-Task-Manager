import { getAuthenticatedUser, jsonNoStore } from "../../../tasks/reviewWorkflow";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

function parseOptionalTimestamp(value: string | null, fieldName: string) {
  if (!value) return { value: null as string | null, error: null as string | null };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { value: null, error: `${fieldName} must be a valid timestamp.` };
  }
  return { value: parsed.toISOString(), error: null };
}

function rpcErrorStatus(code?: string) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (code === "22023" || code === "22P02") return 400;
  return 500;
}

export async function GET(req: Request, { params }: RouteContext) {
  try {
    const { projectId } = await params;
    if (!projectId) {
      return jsonNoStore({ error: "Project id is required." }, 400);
    }

    const url = new URL(req.url);
    const rangeStart = parseOptionalTimestamp(url.searchParams.get("rangeStart"), "rangeStart");
    const rangeEnd = parseOptionalTimestamp(url.searchParams.get("rangeEndExclusive"), "rangeEndExclusive");
    if (rangeStart.error || rangeEnd.error) {
      return jsonNoStore({ error: rangeStart.error ?? rangeEnd.error }, 400);
    }
    if (rangeStart.value && rangeEnd.value && rangeEnd.value <= rangeStart.value) {
      return jsonNoStore({ error: "rangeEndExclusive must be after rangeStart." }, 400);
    }

    const { user, adminClient } = await getAuthenticatedUser(req);
    if (!user) {
      return jsonNoStore({ error: "You must be signed in to view project man-hours." }, 401);
    }

    const { data, error } = await adminClient.rpc("get_project_man_hours", {
      p_project_id: projectId,
      p_range_start: rangeStart.value,
      p_range_end_exclusive: rangeEnd.value,
      p_as_of: null,
      p_actor_id: user.id,
    });

    if (error) {
      return jsonNoStore({ error: error.message }, rpcErrorStatus(error.code));
    }

    return jsonNoStore(data);
  } catch (error) {
    return jsonNoStore({ error: error instanceof Error ? error.message : "Failed to load project man-hours." }, 500);
  }
}
