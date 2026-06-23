import { json, requireAdmin } from "@/lib/adminAuth";
import { computeDeleteUserImpact } from "@/lib/adminUserDeletion";

type RouteContext = {
  params: Promise<{ userId: string }>;
};

type UpdatePayload = {
  name?: string;
  email?: string;
  job_role?: string;
  system_role?: "user" | "admin";
};

const VALID_SYSTEM_ROLES = new Set(["user", "admin"]);

type TargetUserRow = {
  id: string;
  name: string | null;
  email: string | null;
  job_role?: string | null;
  system_role: string | null;
  avatar_url?: string | null;
};

export async function PATCH(req: Request, { params }: RouteContext) {
  const { userId } = await params;
  if (!userId) {
    return json({ error: "User id is required." }, 400);
  }

  const context = await requireAdmin(req);
  if (context instanceof Response) {
    return context;
  }

  const body = (await req.json()) as UpdatePayload;
  const updates: Record<string, string | null> = {};

  if (typeof body.name === "string") {
    updates.name = body.name.trim() || null;
  }
  if (typeof body.email === "string") {
    updates.email = body.email.trim();
  }
  if (typeof body.job_role === "string") {
    updates.job_role = body.job_role.trim();
  }

  if (body.system_role !== undefined) {
    if (!VALID_SYSTEM_ROLES.has(body.system_role)) {
      return json({ error: "Invalid system role." }, 400);
    }
    updates.system_role = body.system_role;
  }

  if (Object.keys(updates).length === 0) {
    return json({ error: "No valid fields provided." }, 400);
  }

  const { data: targetUser, error: targetError } = await context.adminClient
    .from("users")
    .select("id, name, email, job_role, system_role, avatar_url")
    .eq("id", userId)
    .maybeSingle<{
      id: string;
      name: string | null;
      email: string | null;
      job_role: string | null;
      system_role: string | null;
      avatar_url: string | null;
    }>();

  if (targetError || !targetUser) {
    return json({ error: "User not found." }, 404);
  }

  const currentTargetRole = (targetUser.system_role ?? "user").toLowerCase();
  const nextRole = typeof updates.system_role === "string" ? updates.system_role : currentTargetRole;

  if (context.user.id === userId && currentTargetRole === "admin" && nextRole !== "admin") {
    return json({ error: "You cannot demote yourself from admin." }, 400);
  }

  if (currentTargetRole === "admin" && nextRole !== "admin") {
    const { count, error: countError } = await context.adminClient
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("system_role", "admin");

    if (countError) {
      return json({ error: countError.message }, 500);
    }

    if ((count ?? 0) <= 1) {
      return json({ error: "You cannot remove the last admin." }, 400);
    }
  }

  if (typeof updates.email === "string" && updates.email !== targetUser.email) {
    const { error: authUpdateError } = await context.adminClient.auth.admin.updateUserById(userId, {
      email: updates.email,
    });

    if (authUpdateError) {
      return json({ error: authUpdateError.message }, 400);
    }
  }

  const { data: updatedUser, error: updateError } = await context.adminClient
    .from("users")
    .update(updates)
    .eq("id", userId)
    .select("id, name, email, job_role, system_role, avatar_url")
    .single();

  if (updateError) {
    return json({ error: updateError.message }, 500);
  }

  return json({ user: updatedUser });
}

export async function DELETE(req: Request, { params }: RouteContext) {
  const { userId } = await params;
  if (!userId) {
    return json({ error: "User id is required." }, 400);
  }

  const context = await requireAdmin(req);
  if (context instanceof Response) {
    return context;
  }

  if (context.user.id === userId) {
    return json({ error: "You cannot delete your own account." }, 403);
  }

  const { data: targetUser, error: targetError } = await context.adminClient
    .from("users")
    .select("id, name, email, job_role, system_role, avatar_url")
    .eq("id", userId)
    .maybeSingle<TargetUserRow>();

  if (targetError) {
    return json({ error: targetError.message }, 500);
  }

  if (!targetUser) {
    return json({ error: "User not found." }, 404);
  }

  if ((targetUser.system_role ?? "user").toLowerCase() === "admin") {
    const { count, error: adminCountError } = await context.adminClient
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("system_role", "admin")
      .neq("id", userId);

    if (adminCountError) {
      return json({ error: adminCountError.message }, 500);
    }

    if ((count ?? 0) <= 0) {
      return json({ error: "Cannot delete the last admin." }, 409);
    }
  }

  let deleteImpact;
  try {
    deleteImpact = await computeDeleteUserImpact(context.adminClient, userId);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Failed to compute delete impact." }, 500);
  }

  const cleanupSummary: Record<string, number> = {};
  const cleanupWarnings: string[] = [];

  const addSummaryCount = (key: string, count: number | null) => {
    cleanupSummary[key] = count ?? 0;
  };

  for (const transfer of deleteImpact.ownershipTransfers) {
    const { error: transferError } = await context.adminClient
      .from("projects")
      .update({ owner_id: transfer.newOwnerId })
      .eq("id", transfer.projectId);

    if (transferError) {
      return json({ error: `Failed to transfer project ownership: ${transferError.message}` }, 500);
    }

    const { error: promoteOwnerError } = await context.adminClient
      .from("project_members")
      .update({ role: "lead" })
      .eq("project_id", transfer.projectId)
      .eq("user_id", transfer.newOwnerId);

    if (promoteOwnerError) {
      return json({ error: `Failed to promote new project owner: ${promoteOwnerError.message}` }, 500);
    }
  }

  for (const project of deleteImpact.projectsToArchive) {
    const { error: archiveError } = await context.adminClient
      .from("projects")
      .update({ is_active: false })
      .eq("id", project.projectId);

    if (archiveError) {
      return json({ error: `Failed to archive solo-owned project: ${archiveError.message}` }, 500);
    }
  }

  addSummaryCount("ownershipTransferred", deleteImpact.ownershipTransfers.length);
  addSummaryCount("projectsArchived", deleteImpact.projectsToArchive.length);

  const unassignPrimary = await context.adminClient
    .from("tasks")
    .update({ assigned_to: null }, { count: "exact" })
    .eq("assigned_to", userId);

  if (unassignPrimary.error) {
    return json({ error: `Failed cleanup operation: ${unassignPrimary.error.message}` }, 500);
  }
  addSummaryCount("tasksUnassigned", unassignPrimary.count);

  const clearCreatedBy = await context.adminClient
    .from("tasks")
    .update({ created_by: null }, { count: "exact" })
    .eq("created_by", userId);

  if (clearCreatedBy.error) {
    const message = `Could not clear tasks.created_by: ${clearCreatedBy.error.message}`;
    console.warn(message);
    cleanupWarnings.push(message);
  } else {
    addSummaryCount("tasksCreatedByCleared", clearCreatedBy.count);
  }

  const deleteAdditionalAssignees = await context.adminClient
    .from("task_assignees")
    .delete({ count: "exact" })
    .eq("user_id", userId);

  if (deleteAdditionalAssignees.error) {
    return json({ error: `Failed cleanup operation: ${deleteAdditionalAssignees.error.message}` }, 500);
  }
  addSummaryCount("taskAssigneesDeleted", deleteAdditionalAssignees.count);

  const deleteProjectMemberships = await context.adminClient
    .from("project_members")
    .delete({ count: "exact" })
    .eq("user_id", userId);

  if (deleteProjectMemberships.error) {
    return json({ error: `Failed cleanup operation: ${deleteProjectMemberships.error.message}` }, 500);
  }
  addSummaryCount("projectMembershipsDeleted", deleteProjectMemberships.count);

  const deleteNotifications = await context.adminClient
    .from("notifications")
    .delete({ count: "exact" })
    .eq("user_id", userId);

  if (deleteNotifications.error) {
    return json({ error: `Failed cleanup operation: ${deleteNotifications.error.message}` }, 500);
  }
  addSummaryCount("notificationsDeleted", deleteNotifications.count);

  const clearNotificationActors = await context.adminClient
    .from("notifications")
    .update({ actor_id: null }, { count: "exact" })
    .eq("actor_id", userId);

  if (clearNotificationActors.error) {
    return json({ error: `Failed cleanup operation: ${clearNotificationActors.error.message}` }, 500);
  }
  addSummaryCount("notificationActorsCleared", clearNotificationActors.count);

  const clearTaskLogs = await context.adminClient
    .from("task_logs")
    .update({ user_id: null }, { count: "exact" })
    .eq("user_id", userId);

  if (clearTaskLogs.error) {
    const message = `Could not clear task_logs.user_id: ${clearTaskLogs.error.message}`;
    console.warn(message);
    cleanupWarnings.push(message);
  } else {
    addSummaryCount("taskLogsCleared", clearTaskLogs.count);
  }

  const clearTaskAttachments = await context.adminClient
    .from("task_attachments")
    .update({ uploaded_by: null }, { count: "exact" })
    .eq("uploaded_by", userId);

  if (clearTaskAttachments.error) {
    const message = `Could not clear task_attachments.uploaded_by: ${clearTaskAttachments.error.message}`;
    console.warn(message);
    cleanupWarnings.push(message);
  } else {
    addSummaryCount("taskAttachmentsCleared", clearTaskAttachments.count);
  }

  const { error: deleteAuthError } = await context.adminClient.auth.admin.deleteUser(userId);
  if (deleteAuthError) {
    return json(
      {
        error: `Failed to delete auth user: ${deleteAuthError.message}`,
        cleanup: cleanupSummary,
        warnings: cleanupWarnings,
      },
      500,
    );
  }

  const { count: publicUserCount, error: deletePublicUserError } = await context.adminClient
    .from("users")
    .delete({ count: "exact" })
    .eq("id", userId);

  if (deletePublicUserError) {
    return json(
      {
        error: `Failed to delete public user row: ${deletePublicUserError.message}. Check task_updates or other user foreign keys for nullable/on delete behavior.`,
        cleanup: cleanupSummary,
        warnings: cleanupWarnings,
      },
      500,
    );
  }
  addSummaryCount("publicUsersDeleted", publicUserCount);

  return json({
    success: true,
    deletedUserId: userId,
    ownershipTransferred: deleteImpact.ownershipTransfers,
    projectsArchived: deleteImpact.projectsToArchive,
    deletedUser: {
      id: targetUser.id,
      name: targetUser.name,
      email: targetUser.email,
    },
    cleanup: cleanupSummary,
    warnings: cleanupWarnings,
  });
}
