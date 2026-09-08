import {
  canManageColumns,
  canViewColumns,
  ensureDefaultColumns,
  getAuthenticatedUser,
  jsonResponse,
} from "./columnsHelper";
import { isColumnColorKey } from "@/lib/columnColors";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_STATUS_KEYS = ["todo", "in_progress", "draft_review", "in_review", "done"];

export async function GET(req: Request, { params }: RouteContext) {
  try {
    const { projectId } = await params;
    if (!UUID_PATTERN.test(projectId)) {
      return jsonResponse({ error: "Invalid project ID." }, 400);
    }

    const { user, adminClient } = await getAuthenticatedUser(req);
    if (!user) {
      return jsonResponse({ error: "Unauthorized." }, 401);
    }

    const allowed = await canViewColumns(adminClient, projectId, user.id);
    if (!allowed) {
      return jsonResponse({ error: "You do not have access to this project." }, 403);
    }

    const columns = await ensureDefaultColumns(adminClient, projectId);
    return jsonResponse({ columns });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Failed to load project columns." },
      500,
    );
  }
}

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const { projectId } = await params;
    if (!UUID_PATTERN.test(projectId)) {
      return jsonResponse({ error: "Invalid project ID." }, 400);
    }

    const { user, adminClient } = await getAuthenticatedUser(req);
    if (!user) {
      return jsonResponse({ error: "Unauthorized." }, 401);
    }

    const allowed = await canManageColumns(adminClient, projectId, user.id);
    if (!allowed) {
      return jsonResponse({ error: "You do not have permission to manage columns for this project." }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as {
      title?: string;
      status_key?: string;
      colorKey?: string;
      trackManHours?: boolean;
    };

    const title = (body.title ?? "").trim();
    if (!title) {
      return jsonResponse({ error: "Column title is required." }, 400);
    }
    if (title.length > 50) {
      return jsonResponse({ error: "Column title cannot exceed 50 characters." }, 400);
    }
    if (!isColumnColorKey(body.colorKey)) {
      return jsonResponse({ error: "Choose a valid column color." }, 400);
    }
    if (typeof body.trackManHours !== "boolean") {
      return jsonResponse({ error: "Track Man-Hours must be on or off." }, 400);
    }

    const statusKey = body.status_key && ALLOWED_STATUS_KEYS.includes(body.status_key)
      ? body.status_key
      : "in_progress";

    // Ensure default columns exist first so we don't start with empty sort_order
    const existing = await ensureDefaultColumns(adminClient, projectId);
    const maxSort = existing.reduce((max, c) => Math.max(max, c.sort_order), -1);
    const nextSortOrder = maxSort + 1;

    const { data: inserted, error } = await adminClient
      .from("project_board_columns")
      .insert({
        project_id: projectId,
        title,
        sort_order: nextSortOrder,
        stage_type: "custom",
        status_key: statusKey,
        is_locked: false,
        color_key: body.colorKey,
        track_man_hours: body.trackManHours,
      })
      .select("*")
      .single();

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({ column: inserted }, 201);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Failed to create column." },
      500,
    );
  }
}
