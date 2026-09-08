import {
  canManageColumns,
  getAuthenticatedUser,
  jsonResponse,
} from "../columnsHelper";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PUT(req: Request, { params }: RouteContext) {
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
      return jsonResponse({ error: "You do not have permission to reorder columns for this project." }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as { columnIds?: string[] };
    const columnIds = body.columnIds;

    if (!Array.isArray(columnIds) || columnIds.length === 0) {
      return jsonResponse({ error: "columnIds array is required." }, 400);
    }

    // Load existing columns
    const { data: existing, error: loadError } = await adminClient
      .from("project_board_columns")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true });

    if (loadError || !existing) {
      return jsonResponse({ error: "Failed to load project columns." }, 500);
    }

    if (existing.length !== columnIds.length) {
      return jsonResponse({ error: "Column IDs list does not match project column count." }, 400);
    }

    const existingMap = new Map(existing.map((col) => [col.id, col]));
    for (const id of columnIds) {
      if (!existingMap.has(id)) {
        return jsonResponse({ error: `Column ${id} does not belong to this project.` }, 400);
      }
    }

    // Find locked TO DO column
    const lockedCol = existing.find((col) => col.is_locked || col.stage_type === "todo");
    if (lockedCol && columnIds[0] !== lockedCol.id) {
      return jsonResponse(
        { error: "TO DO must remain the first column and cannot be reordered." },
        400,
      );
    }

    // Persist new sort_order for each column
    const updates = columnIds.map((id, index) =>
      adminClient
        .from("project_board_columns")
        .update({ sort_order: index, updated_at: new Date().toISOString() })
        .eq("id", id),
    );

    await Promise.all(updates);

    const { data: reordered } = await adminClient
      .from("project_board_columns")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true });

    return jsonResponse({ success: true, columns: reordered });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Failed to reorder columns." },
      500,
    );
  }
}
