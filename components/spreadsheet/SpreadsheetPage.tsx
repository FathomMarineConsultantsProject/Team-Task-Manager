"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppData } from "@/components/providers/AppDataProvider";

type AssignedUser = {
  id: string;
  name: string | null;
  email: string | null;
};

type TaskRow = {
  id: string;
  title: string | null;
  status: string | null;
  priority: string | null;
  start_date: string | null;
  end_date: string | null;
  assigned_to: string | null;
  project_id: string | null;
};

type SpreadsheetTaskRow = TaskRow & {
  assigned_user: AssignedUser | null;
};

export default function SpreadsheetPage() {
  const { supabase, authUser, profile, isAuthLoading } = useAppData();
  const [tasks, setTasks] = useState<SpreadsheetTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAssignee, setSelectedAssignee] = useState<string>("all");

  const currentUser = profile;
  const normalizedRole = (currentUser?.system_role ?? currentUser?.role ?? "").toLowerCase();
  const isAdminUser = normalizedRole === "admin" || normalizedRole === "super_admin";

  const loadTasks = useCallback(async () => {
    if (isAuthLoading) {
      return;
    }

    if (!authUser?.id || !currentUser?.id) {
      setTasks([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const { data: tasksData, error: tasksError } = await supabase
        .from("tasks")
        .select(
          `
    id,
    title,
    status,
    priority,
    start_date,
    end_date,
    assigned_to,
    project_id
  `,
        );

      if (tasksError) {
        throw tasksError;
      }

      const rows = (tasksData ?? []) as TaskRow[];

      const assignedIds = [...new Set(rows.map((t) => t.assigned_to).filter(Boolean))] as string[];

      let userMap: Record<string, AssignedUser> = {};

      if (assignedIds.length > 0) {
        const { data: usersData, error: usersError } = await supabase
          .from("users")
          .select("id, name, email")
          .in("id", assignedIds);

        if (usersError) {
          console.error(usersError);
        } else {
          userMap = Object.fromEntries(
            (usersData ?? []).map((u) => [u.id, u as AssignedUser]),
          );
        }
      }

      const finalTasks: SpreadsheetTaskRow[] = rows.map((task) => ({
        ...task,
        assigned_user: task.assigned_to ? userMap[task.assigned_to] ?? null : null,
      }));

      let next = finalTasks;
      if (!isAdminUser) {
        next = finalTasks.filter((t) => t.assigned_to === currentUser.id);
      }

      setTasks(next);
    } catch (err) {
      console.error(err);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [authUser?.id, currentUser?.id, isAdminUser, isAuthLoading, supabase]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    if (!isAdminUser) {
      setSelectedAssignee("all");
    }
  }, [isAdminUser]);

  const assigneeOptions = useMemo(() => {
    const map = new Map<string, string>();
    tasks.forEach((task) => {
      const id = task.assigned_to;
      if (!id) {
        return;
      }
      const label = task.assigned_user?.name?.trim() || task.assigned_user?.email?.trim() || "User";
      map.set(id, label);
    });
    return Array.from(map.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [tasks]);

  const visibleTasks = useMemo(() => {
    if (!isAdminUser || selectedAssignee === "all") {
      return tasks;
    }
    return tasks.filter((task) => task.assigned_to === selectedAssignee);
  }, [isAdminUser, selectedAssignee, tasks]);

  const handleDelete = async (taskId: string) => {
    const confirmed = window.confirm("Delete this task?");
    if (!confirmed) {
      return;
    }

    const { error } = await supabase.from("tasks").delete().eq("id", taskId);

    if (error) {
      console.error(error);
      window.alert("Failed to delete task.");
      return;
    }

    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  const showSpinner = isAuthLoading || loading;

  if (showSpinner) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Spreadsheet</h1>
        <div className="h-10 w-56 animate-pulse rounded-xl bg-slate-100" />
      </div>
    );
  }

  if (!authUser || !currentUser) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        Please sign in to view the spreadsheet.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Spreadsheet</h1>
        <p className="mt-1 text-sm text-slate-500">
          {isAdminUser ? "All tasks in your workspace projects." : "Tasks assigned to you."}
        </p>
      </div>

      {isAdminUser ? (
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <label htmlFor="spreadsheet-assignee" className="font-medium text-slate-700">
            Assignee
          </label>
          <select
            id="spreadsheet-assignee"
            className="min-w-[200px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-300"
            value={selectedAssignee}
            onChange={(e) => setSelectedAssignee(e.target.value)}
          >
            <option value="all">All</option>
            {assigneeOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="overflow-auto max-h-[80vh] border border-slate-200 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 uppercase">
              <th className="px-4 py-2">Key</th>
              <th className="px-4 py-2">Summary</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Priority</th>
              <th className="px-4 py-2">Assignee</th>
              <th className="px-4 py-2">Start Date</th>
              <th className="px-4 py-2">Due Date</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleTasks.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
                  No tasks to show.
                </td>
              </tr>
            ) : (
              visibleTasks.map((task, index) => (
                <tr key={task.id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-2">TASK-{index + 1}</td>
                  <td className="px-4 py-2 font-medium">{task.title ?? ""}</td>
                  <td className="px-4 py-2">{task.status || "todo"}</td>
                  <td className="px-4 py-2">{task.priority || "-"}</td>
                  <td className="px-4 py-2">{task.assigned_user?.name || "Unassigned"}</td>
                  <td className="px-4 py-2">{task.start_date || "-"}</td>
                  <td className="px-4 py-2">{task.end_date || "-"}</td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => void handleDelete(task.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
