import { canManageColumns, getAuthenticatedUser, jsonResponse } from "../columns/columnsHelper";

type RouteContext = { params: Promise<{ projectId: string }> };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const minutesFromMidnight = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const { projectId } = await params;
    if (!UUID_PATTERN.test(projectId)) return jsonResponse({ error: "Invalid project ID." }, 400);

    const { user, adminClient } = await getAuthenticatedUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized." }, 401);
    if (!(await canManageColumns(adminClient, projectId, user.id))) {
      return jsonResponse({ error: "You do not have permission to edit project working hours." }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as { startTime?: string; endTime?: string };
    const startTime = body.startTime?.trim() ?? "";
    const endTime = body.endTime?.trim() ?? "";
    if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) {
      return jsonResponse({ error: "Choose valid start and end times." }, 400);
    }
    if (minutesFromMidnight(endTime) <= minutesFromMidnight(startTime)) {
      return jsonResponse({ error: "End time must be later than start time." }, 400);
    }

    const { data, error } = await adminClient
      .from("projects")
      .update({ normal_workday_start: startTime, normal_workday_end: endTime })
      .eq("id", projectId)
      .select("normal_workday_start, normal_workday_end, time_zone")
      .single();
    if (error) return jsonResponse({ error: error.message }, 500);

    return jsonResponse({ workingHours: data });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Failed to save project working hours." }, 500);
  }
}
