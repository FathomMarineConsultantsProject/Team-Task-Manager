import {
  canManageColumns,
  getAuthenticatedUser,
  jsonResponse,
} from "../columnsHelper";

type RouteContext = {
  params: Promise<{ projectId: string; columnId: string }>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const { projectId, columnId } = await params;
    if (!UUID_PATTERN.test(projectId) || !UUID_PATTERN.test(columnId)) {
      return jsonResponse({ error: "Invalid project ID or column ID." }, 400);
    }

    const { user, adminClient } = await getAuthenticatedUser(req);
    if (!user) {
      return jsonResponse({ error: "Unauthorized." }, 401);
    }

    const allowed = await canManageColumns(adminClient, projectId, user.id);
    if (!allowed) {
      return jsonResponse({ error: "You do not have permission to rename columns for this project." }, 403);
    }

    const { data: column, error: findError } = await adminClient
      .from("project_board_columns")
      .select("*")
      .eq("id", columnId)
      .eq("project_id", projectId)
      .maybeSingle();

    if (findError || !column) {
      return jsonResponse({ error: "Column not found." }, 404);
    }

    if (column.is_locked) {
      return jsonResponse({ error: "Locked columns cannot be renamed." }, 400);
    }

    const body = (await req.json().catch(() => ({}))) as { title?: string };
    const title = (body.title ?? "").trim();
    if (!title) {
      return jsonResponse({ error: "Column title is required." }, 400);
    }
    if (title.length > 50) {
      return jsonResponse({ error: "Column title cannot exceed 50 characters." }, 400);
    }

    const { data: updated, error: updateError } = await adminClient
      .from("project_board_columns")
      .update({ title, updated_at: new Date().toISOString() })
      .eq("id", columnId)
      .select("*")
      .single();

    if (updateError) {
      return jsonResponse({ error: updateError.message }, 500);
    }

    return jsonResponse({ column: updated });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Failed to rename column." },
      500,
    );
  }
}

export async function DELETE(req: Request, { params }: RouteContext) {
  try {
    const { projectId, columnId } = await params;
    if (!UUID_PATTERN.test(projectId) || !UUID_PATTERN.test(columnId)) {
      return jsonResponse({ error: "Invalid project ID or column ID." }, 400);
    }

    const { user, adminClient } = await getAuthenticatedUser(req);
    if (!user) {
      return jsonResponse({ error: "Unauthorized." }, 401);
    }

    const allowed = await canManageColumns(adminClient, projectId, user.id);
    if (!allowed) {
      return jsonResponse({ error: "You do not have permission to delete columns for this project." }, 403);
    }

    const { data: column, error: findError } = await adminClient
      .from("project_board_columns")
      .select("*")
      .eq("id", columnId)
      .eq("project_id", projectId)
      .maybeSingle();

    if (findError || !column) {
      return jsonResponse({ error: "Column not found." }, 404);
    }

    if (column.is_locked) {
      return jsonResponse({ error: "Locked columns cannot be deleted." }, 400);
    }

    // Check for tasks currently assigned to this column
    const { count, error: countError } = await adminClient
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("column_id", columnId);

    if (countError) {
      return jsonResponse({ error: countError.message }, 500);
    }

    const taskCount = count ?? 0;
    const body = (await req.json().catch(() => ({}))) as { moveTasksToColumnId?: string };
    const targetColumnId = body.moveTasksToColumnId;

    if (taskCount > 0) {
      if (!targetColumnId) {
        return jsonResponse(
          {
            error: "This column contains tasks. Reassign them before deleting.",
            taskCount,
            requiresReassignment: true,
          },
          409,
        );
      }

      if (targetColumnId === columnId) {
        return jsonResponse({ error: "Cannot move tasks to the column being deleted." }, 400);
      }

      const { data: targetCol, error: targetColError } = await adminClient
        .from("project_board_columns")
        .select("*")
        .eq("id", targetColumnId)
        .eq("project_id", projectId)
        .maybeSingle();

      if (targetColError || !targetCol) {
        return jsonResponse({ error: "Target column for task reassignment not found." }, 400);
      }

      // Move tasks to target column safely
      const nowIso = new Date().toISOString();
      const updates: Record<string, unknown> = {
        column_id: targetColumnId,
        status: targetCol.status_key,
        updated_at: nowIso,
      };

      if (targetCol.status_key === "done") {
        updates.completed_at = nowIso;
      } else {
        updates.completed_at = null;
      }

      const { error: moveError } = await adminClient
        .from("tasks")
        .update(updates)
        .eq("column_id", columnId);

      if (moveError) {
        return jsonResponse({ error: `Failed to move tasks: ${moveError.message}` }, 500);
      }
    }

    // Delete the column
    const { error: deleteError } = await adminClient
      .from("project_board_columns")
      .delete()
      .eq("id", columnId);

    if (deleteError) {
      return jsonResponse({ error: deleteError.message }, 500);
    }

    // Re-index sort orders to keep them continuous
    const { data: remaining } = await adminClient
      .from("project_board_columns")
      .select("id, sort_order, is_locked")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true });

    if (remaining) {
      for (let i = 0; i < remaining.length; i++) {
        if (remaining[i].sort_order !== i) {
          await adminClient
            .from("project_board_columns")
            .update({ sort_order: i })
            .eq("id", remaining[i].id);
        }
      }
    }

    return jsonResponse({ success: true, movedTasks: taskCount });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Failed to delete column." },
      500,
    );
  }
}
