"use client";

import { useCallback, useState } from "react";
import { exportProjectToExcel } from "@/lib/exportTasksToExcel";
import type { ExportPendingInput, ExportTask, ExportTaskComment } from "@/lib/exportTasksToExcel";

type SupabaseClient = {
  from: (table: string) => any;
  storage: { from: (bucket: string) => any };
};

type MemberRow = {
  user_id: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
};

type TaskUpdateRow = {
  id: string;
  task_id: string;
  user_id: string | null;
  content: string | null;
  created_at: string | null;
};

type TaskDependencyRow = {
  task_id: string;
  title: string | null;
  details: string | null;
  due_at: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  resolved_at: string | null;
};

type ProjectReviewerRow = {
  reviewer: {
    id: string | null;
    name: string | null;
    email: string | null;
    job_role: string | null;
  } | null;
};

type ExportTasksOptions = {
  statusFilter?: string;
  statusLabel?: string;
  taskIds?: string[];
};

function normalizeStatus(status: string | null): string {
  return (status ?? "").toLowerCase().trim().replace(/\s+/g, "_");
}

function statusMatchesFilter(status: string | null, statusFilter: string | undefined): boolean {
  if (!statusFilter) return true;

  const normalizedStatus = normalizeStatus(status);
  const normalizedFilter = normalizeStatus(statusFilter);

  if (normalizedFilter === "todo") {
    return normalizedStatus === "todo" || normalizedStatus === "not_started";
  }

  if (normalizedFilter === "in_review") {
    return normalizedStatus === "in_review" || normalizedStatus === "review";
  }

  if (normalizedFilter === "done" || normalizedFilter === "completed") {
    return normalizedStatus === "done" || normalizedStatus === "completed";
  }

  return normalizedStatus === normalizedFilter;
}

function formatExportCommentDate(iso: string | null): string {
  if (!iso) return "No date";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPendingDueDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return ` (Due ${date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })})`;
}

function formatCommentText(comment: TaskUpdateRow, userMap: Record<string, string>): string {
  const author = comment.user_id ? (userMap[comment.user_id] ?? "Unknown") : "Unknown";
  return `[${formatExportCommentDate(comment.created_at)}] ${author}: ${comment.content ?? ""}`;
}

function formatPendingInputs(dependencies: TaskDependencyRow[]): string {
  return dependencies
    .slice()
    .sort((a, b) => {
      const aResolved = normalizeStatus(a.status) === "resolved" || Boolean(a.resolved_at);
      const bResolved = normalizeStatus(b.status) === "resolved" || Boolean(b.resolved_at);
      if (aResolved !== bResolved) return aResolved ? 1 : -1;
      return (a.due_at ?? a.created_at ?? "").localeCompare(b.due_at ?? b.created_at ?? "");
    })
    .map((dependency) => {
      const title = dependency.title?.trim() || dependency.details?.trim() || "Pending input";
      const isResolved = normalizeStatus(dependency.status) === "resolved" || Boolean(dependency.resolved_at);
      const prefix = isResolved ? "Resolved" : "Pending";
      return `${prefix}: ${title}${formatPendingDueDate(dependency.due_at)}`;
    })
    .join("\n");
}

export function useExportTasks({
  supabase,
  projectId,
  projectName,
  members,
}: {
  supabase: SupabaseClient;
  projectId: string;
  projectName: string | null;
  members: MemberRow[];
}) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExportTasks = useCallback(async (options?: ExportTasksOptions) => {
    if (!projectId || !projectName) return;
    setIsExporting(true);

    try {
      // 1. Fetch all tasks with full data
      const { data: tasksData, error: tasksErr } = await supabase
        .from("tasks")
        .select(
          "id, title, description, status, priority, assigned_to, created_by, start_date, end_date, draft_review_started_at, draft_review_due_at, completed_at, created_at, updated_at",
        )
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (tasksErr || !tasksData) {
        console.error("[Export] Failed to fetch tasks:", tasksErr);
        alert("Failed to export tasks. Please try again.");
        return;
      }

      let taskRows = tasksData as {
        id: string;
        title: string | null;
        description: string | null;
        status: string | null;
        priority: string | null;
        assigned_to: string | null;
        created_by: string | null;
        start_date: string | null;
        end_date: string | null;
        draft_review_started_at: string | null;
        draft_review_due_at: string | null;
        completed_at: string | null;
        created_at: string | null;
        updated_at: string | null;
      }[];

      const scopedTaskIds = options?.taskIds?.length ? new Set(options.taskIds) : null;
      taskRows = taskRows.filter((task) => {
        const matchesTaskId = scopedTaskIds ? scopedTaskIds.has(task.id) : true;
        return matchesTaskId && statusMatchesFilter(task.status, options?.statusFilter);
      });

      if (taskRows.length === 0) {
        alert(options?.statusLabel ? `No tasks in ${options.statusLabel} to export.` : "No tasks to export.");
        return;
      }

      // 2. Collect unique user IDs for name resolution
      const userIds = new Set<string>();
      taskRows.forEach((t) => {
        if (t.assigned_to) userIds.add(t.assigned_to);
        if (t.created_by) userIds.add(t.created_by);
      });

      // 3. Fetch multi-assignees
      const taskIds = taskRows.map((t) => t.id);
      const multiAssigneeMap: Record<string, string[]> = {};

      if (taskIds.length > 0) {
        try {
          const { data: assigneesData } = await supabase
            .from("task_assignees")
            .select("task_id, user_id")
            .in("task_id", taskIds);

          if (assigneesData) {
            (assigneesData as { task_id: string; user_id: string }[]).forEach((row) => {
              if (!multiAssigneeMap[row.task_id]) multiAssigneeMap[row.task_id] = [];
              multiAssigneeMap[row.task_id].push(row.user_id);
              userIds.add(row.user_id);
            });
          }
        } catch {
          // task_assignees table may not exist yet
        }
      }

      // 4. Fetch comments and pending inputs before resolving user names
      const commentCounts: Record<string, number> = {};
      const commentsByTaskId: Record<string, TaskUpdateRow[]> = {};
      const dependenciesByTaskId: Record<string, TaskDependencyRow[]> = {};

      if (taskIds.length > 0) {
        try {
          const { data: commentsData } = await supabase
            .from("task_updates")
            .select("id, task_id, user_id, content, created_at")
            .eq("project_id", projectId)
            .in("task_id", taskIds);

          if (commentsData) {
            (commentsData as TaskUpdateRow[]).forEach((row) => {
              commentCounts[row.task_id] = (commentCounts[row.task_id] ?? 0) + 1;
              if (!commentsByTaskId[row.task_id]) commentsByTaskId[row.task_id] = [];
              commentsByTaskId[row.task_id].push(row);
              if (row.user_id) userIds.add(row.user_id);
            });
          }
        } catch {
          // fail silently
        }

        try {
          const { data: dependencyData, error: dependencyError } = await supabase
            .from("task_dependencies")
            .select("task_id, title, details, due_at, status, created_at, updated_at, resolved_at")
            .in("task_id", taskIds);

          if (dependencyError) {
            console.warn("[Export] Failed to fetch pending inputs:", dependencyError);
          } else if (dependencyData) {
            (dependencyData as TaskDependencyRow[]).forEach((row) => {
              if (!dependenciesByTaskId[row.task_id]) dependenciesByTaskId[row.task_id] = [];
              dependenciesByTaskId[row.task_id].push(row);
            });
          }
        } catch (error) {
          console.warn("[Export] Failed to fetch pending inputs:", error);
        }
      }

      // 5. Resolve user names
      const userMap: Record<string, string> = {};
      const userIdArr = [...userIds];
      if (userIdArr.length > 0) {
        try {
          const { data: usersData } = await supabase
            .from("users")
            .select("id, name, email")
            .in("id", userIdArr);

          if (usersData) {
            (usersData as { id: string; name: string | null; email: string | null }[]).forEach(
              (u) => {
                userMap[u.id] = u.name || u.email || "Unknown";
              },
            );
          }
        } catch {
          // fail silently
        }
      }

      // 6. Fetch attachment counts
      const attachmentCounts: Record<string, number> = {};
      if (taskIds.length > 0) {
        try {
          const { data: attData } = await supabase
            .from("task_attachments")
            .select("task_id")
            .in("task_id", taskIds);

          if (attData) {
            (attData as { task_id: string }[]).forEach((row) => {
              attachmentCounts[row.task_id] = (attachmentCounts[row.task_id] ?? 0) + 1;
            });
          }
        } catch {
          // fail silently
        }
      }

      // 7. Build ExportTask array
      const exportTasks: ExportTask[] = taskRows.map((t) => {
        // Combine primary assignee + multi-assignees (no duplicates)
        const assigneeNames: string[] = [];
        if (t.assigned_to && userMap[t.assigned_to]) {
          assigneeNames.push(userMap[t.assigned_to]);
        }
        const additional = multiAssigneeMap[t.id] ?? [];
        additional.forEach((uid) => {
          if (uid !== t.assigned_to && userMap[uid]) {
            assigneeNames.push(userMap[uid]);
          }
        });

        const isDraftReview = normalizeStatus(t.status) === "draft_review";
        const sortedComments = (commentsByTaskId[t.id] ?? [])
          .slice()
          .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
        const commentBlocks: ExportTaskComment[] = sortedComments.map((comment) => ({
          author: comment.user_id ? (userMap[comment.user_id] ?? "Unknown") : "Unknown",
          createdAt: comment.created_at,
          content: comment.content,
        }));
        const commentsText = sortedComments.map((comment) => formatCommentText(comment, userMap)).join("\n\n");
        const pendingInputItems: ExportPendingInput[] = (dependenciesByTaskId[t.id] ?? []).map((dependency) => ({
          title: dependency.title,
          details: dependency.details,
          status: dependency.status,
          dueAt: dependency.due_at,
          createdAt: dependency.created_at,
          resolvedAt: dependency.resolved_at,
        }));

        return {
          id: t.id,
          title: t.title ?? "Untitled",
          description: t.description,
          status: t.status ?? "todo",
          priority: t.priority,
          assignees: assigneeNames.length > 0 ? assigneeNames.join(", ") : "",
          createdBy: t.created_by ? (userMap[t.created_by] ?? "Unknown") : "Unknown",
          startDate: t.start_date,
          dueDate: t.end_date,
          draftReviewStartDate: isDraftReview ? t.draft_review_started_at : null,
          reviewDueDate: isDraftReview ? t.draft_review_due_at : null,
          createdAt: t.created_at,
          updatedAt: t.updated_at,
          commentsCount: commentCounts[t.id] ?? 0,
          commentsText,
          commentBlocks,
          pendingInputs: formatPendingInputs(dependenciesByTaskId[t.id] ?? []),
          pendingInputItems,
          nextAction: "",
          targetRevisionDate: "",
          targetApprovalDate: "",
          attachmentCount: attachmentCounts[t.id] ?? 0,
        };
      });

      // 8. Build team members list
      const teamMemberNames = members
        .map((m) => m.user?.name || m.user?.email || "Unknown")
        .filter(Boolean);

      let projectReviewerNames: string[] = [];
      try {
        const { data: reviewerData, error: reviewerError } = await supabase
          .from("project_reviewers")
          .select(
            `
              reviewer:users!project_reviewers_user_id_fkey (
                id,
                name,
                email,
                job_role
              )
            `,
          )
          .eq("project_id", projectId);

        if (reviewerError) {
          console.warn("[Export] Failed to fetch project reviewers:", reviewerError);
        } else if (reviewerData) {
          projectReviewerNames = (reviewerData as ProjectReviewerRow[])
            .map((row) => row.reviewer?.name || row.reviewer?.email || "")
            .filter(Boolean);
        }
      } catch (error) {
        console.warn("[Export] Failed to fetch project reviewers:", error);
      }

      // 9. Generate & download
      await exportProjectToExcel({
        projectName: projectName ?? "Project",
        exportScope: options?.statusLabel ?? null,
        projectReviewers: projectReviewerNames,
        teamMembers: teamMemberNames,
        tasks: exportTasks,
      });
    } catch (err) {
      console.error("[Export] Unexpected error:", err);
      alert("Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }, [projectId, projectName, supabase, members]);

  return { isExporting, handleExportTasks };
}
