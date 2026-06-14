"use client";

import { useCallback, useState } from "react";
import { exportProjectToExcel } from "@/lib/exportTasksToExcel";
import type { ExportTask } from "@/lib/exportTasksToExcel";

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

  const handleExportTasks = useCallback(async () => {
    if (!projectId || !projectName) return;
    setIsExporting(true);

    try {
      // 1. Fetch all tasks with full data
      const { data: tasksData, error: tasksErr } = await supabase
        .from("tasks")
        .select(
          "id, title, description, status, priority, assigned_to, created_by, start_date, end_date, created_at, updated_at",
        )
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (tasksErr || !tasksData) {
        console.error("[Export] Failed to fetch tasks:", tasksErr);
        alert("Failed to export tasks. Please try again.");
        return;
      }

      const taskRows = tasksData as {
        id: string;
        title: string | null;
        description: string | null;
        status: string | null;
        priority: string | null;
        assigned_to: string | null;
        created_by: string | null;
        start_date: string | null;
        end_date: string | null;
        created_at: string | null;
        updated_at: string | null;
      }[];

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

      // 4. Resolve user names
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

      // 5. Fetch comment counts (task_updates)
      const commentCounts: Record<string, number> = {};
      if (taskIds.length > 0) {
        try {
          const { data: commentsData } = await supabase
            .from("task_updates")
            .select("task_id")
            .eq("project_id", projectId)
            .in("task_id", taskIds);

          if (commentsData) {
            (commentsData as { task_id: string }[]).forEach((row) => {
              commentCounts[row.task_id] = (commentCounts[row.task_id] ?? 0) + 1;
            });
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
          createdAt: t.created_at,
          updatedAt: t.updated_at,
          commentsCount: commentCounts[t.id] ?? 0,
          attachmentCount: attachmentCounts[t.id] ?? 0,
        };
      });

      // 8. Build team members list
      const teamMemberNames = members
        .map((m) => m.user?.name || m.user?.email || "Unknown")
        .filter(Boolean);

      // 9. Generate & download
      await exportProjectToExcel({
        projectName: projectName ?? "Project",
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
