import { addWorkingDays } from "@/lib/workingDays";
import {
  REVIEW_GATE_ERROR,
  getAuthenticatedUser,
  isTaskStatus,
  json,
  loadPendingReviewers,
  normalizeRole,
  resetTaskReviewCycle,
  type ProjectRow,
  type TaskStatusRow,
} from "../../reviewWorkflow";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

const getDraftReviewDateFields = (enteredAt = new Date()) => ({
  draft_review_started_at: enteredAt.toISOString(),
  draft_review_due_at: addWorkingDays(enteredAt, 5).toISOString(),
});

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const { taskId } = await params;
    const { status } = (await req.json()) as { status?: string };

    if (!taskId) {
      return json({ error: "Task id is required." }, 400);
    }

    if (!status || !isTaskStatus(status)) {
      return json({ error: "Valid task status is required." }, 400);
    }

    const { user, adminClient } = await getAuthenticatedUser(req);
    if (!user) {
      return json({ error: "You must be signed in to update task status." }, 401);
    }

    const { data: task, error: taskError } = await adminClient
      .from("tasks")
      .select("id, project_id, status, assigned_to, start_date")
      .eq("id", taskId)
      .single();

    const typedTask = task as (TaskStatusRow & { assigned_to: string | null; start_date: string | null }) | null;
    if (taskError || !typedTask) {
      return json({ error: "Task not found." }, 404);
    }

    const [projectResult, membershipResult, profileResult, assigneeResult] = await Promise.all([
      adminClient
        .from("projects")
        .select("id, owner_id")
        .eq("id", typedTask.project_id)
        .single(),
      adminClient
        .from("project_members")
        .select("role")
        .eq("project_id", typedTask.project_id)
        .eq("user_id", user.id)
        .maybeSingle(),
      adminClient
        .from("users")
        .select("system_role")
        .eq("id", user.id)
        .maybeSingle(),
      adminClient
        .from("task_assignees")
        .select("user_id")
        .eq("task_id", taskId)
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    const typedProject = projectResult.data as ProjectRow | null;
    if (projectResult.error || !typedProject) {
      return json({ error: "Project not found." }, 404);
    }

    const leadMember = membershipResult.data;
    const profile = profileResult.data;
    const taskAssignee = assigneeResult.data;

    const isProjectOwner = typedProject.owner_id === user.id;
    const isProjectLead = normalizeRole((leadMember as { role: string | null } | null)?.role) === "lead";
    const systemRole = normalizeRole((profile as { system_role: string | null } | null)?.system_role);
    const isAdmin = systemRole === "admin" || systemRole === "super_admin";
    const isAssignee = typedTask.assigned_to === user.id || Boolean(taskAssignee);
    const isFutureLocked =
      Boolean(typedTask.start_date) &&
      (() => {
        const today = new Date();
        const taskStart = new Date(typedTask.start_date as string);
        today.setHours(0, 0, 0, 0);
        taskStart.setHours(0, 0, 0, 0);
        return taskStart > today;
      })();

    if (!(isProjectOwner || isProjectLead || isAdmin || (isAssignee && !isFutureLocked))) {
      return json({ error: "You do not have permission to update this task status." }, 403);
    }

    const previousStatus = typedTask.status ?? "todo";

    if (previousStatus === "in_review" && status === "done") {
      const pending = await loadPendingReviewers(adminClient, taskId);
      if (pending.totalCount > 0 && pending.pendingReviewerIds.length > 0 && !isProjectOwner && !isProjectLead) {
        return json(
          {
            error: REVIEW_GATE_ERROR,
            pendingReviewerIds: pending.pendingReviewerIds,
            pendingReviewers: pending.pendingReviewers,
          },
          409,
        );
      }
    }

    const enteredInReview = previousStatus !== "in_review" && status === "in_review";
    if (enteredInReview) {
      await resetTaskReviewCycle(adminClient, taskId, typedTask.project_id);
    }

    const statusPayload = {
      status,
      updated_at: new Date().toISOString(),
      ...(status === "draft_review" && previousStatus !== "draft_review" ? getDraftReviewDateFields() : {}),
    };

    const { data: updatedTask, error: updateError } = await adminClient
      .from("tasks")
      .update(statusPayload)
      .eq("id", taskId)
      .eq("project_id", typedTask.project_id)
      .select("id, status, completed_at, updated_at, draft_review_started_at, draft_review_due_at")
      .single();

    if (updateError) {
      return json({ error: updateError.message }, 500);
    }

    const { error: logError } = await adminClient.from("task_logs").insert([
      {
        task_id: taskId,
        action: "moved",
        from_status: previousStatus,
        to_status: status,
        user_id: user.id,
      },
    ]);

    if (logError) {
      console.warn("Failed to insert task status move log", {
        taskId,
        userId: user.id,
        error: logError.message,
      });
    }

    return json({ task: updatedTask, reviewCycleReset: enteredInReview });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Failed to update task status." }, 500);
  }
}
