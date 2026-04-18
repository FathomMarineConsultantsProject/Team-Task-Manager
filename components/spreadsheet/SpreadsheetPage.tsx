"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppData } from "@/components/providers/AppDataProvider";

type AssignedUser = {
  id: string;
  name: string | null;
  email: string | null;
};

/** Same shape as board `Add Member` directory (`DbUser`). */
type DbUser = {
  id: string;
  name: string | null;
  email: string | null;
  job_role: string | null;
};

type TaskRow = {
  id: string;
  title: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  assigned_to: string | null;
  project_id: string | null;
};

type SpreadsheetTaskRow = TaskRow & {
  assigned_user: AssignedUser | null;
};

function normalizeStatusKey(status: string | null | undefined): string {
  const key = (status ?? "todo").toLowerCase();
  if (key === "review") {
    return "in_review";
  }
  return key;
}

function statusBadgeClass(statusKey: string): string {
  switch (statusKey) {
    case "todo":
      return "bg-blue-100 text-blue-700";
    case "in_progress":
      return "bg-amber-100 text-amber-800";
    case "in_review":
      return "bg-purple-100 text-purple-800";
    case "done":
      return "bg-green-100 text-green-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export default function SpreadsheetPage() {
  const { supabase, authUser, profile, isAuthLoading } = useAppData();
  const [tasks, setTasks] = useState<SpreadsheetTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<DbUser | null>(null);
  const [directoryUsers, setDirectoryUsers] = useState<DbUser[]>([]);

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
    let isMounted = true;

    const loadUsers = async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, name, email, job_role")
        .order("name", { ascending: true });

      if (error) {
        console.error("Failed to load users", error);
        return;
      }

      if (isMounted) {
        setDirectoryUsers((data as DbUser[] | null | undefined) ?? []);
      }
    };

    void loadUsers();

    return () => {
      isMounted = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (!isAdminUser) {
      setAssigneeSearch("");
      setSelectedUser(null);
    }
  }, [isAdminUser]);

  useEffect(() => {
    if (!assigneeSearch) {
      setSelectedUser(null);
    }
  }, [assigneeSearch]);

  const filteredUsers = useMemo(() => {
    const search = assigneeSearch.trim().toLowerCase();

    if (!search) {
      return [];
    }

    return directoryUsers
      .filter((user) => {
        const name = user.name?.toLowerCase() ?? "";
        const role = user.job_role?.toLowerCase() ?? "";
        return name.includes(search) || role.includes(search);
      })
      .slice(0, 8);
  }, [directoryUsers, assigneeSearch]);

  const filteredTasks = useMemo(() => {
    const allTasks = tasks;
    if (!selectedUser) {
      return allTasks;
    }
    return allTasks.filter((task) => task.assigned_to === selectedUser.id);
  }, [tasks, selectedUser]);

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
          <label htmlFor="spreadsheet-assignee-search" className="font-medium text-slate-700">
            Assignee
          </label>
          <div className="relative w-64">
            <input
              id="spreadsheet-assignee-search"
              type="text"
              placeholder="Search assignee or role"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
              value={assigneeSearch}
              onChange={(e) => {
                setAssigneeSearch(e.target.value);
                setSelectedUser(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && filteredUsers.length > 0) {
                  e.preventDefault();
                  const user = filteredUsers[0];
                  const label = user.name ?? user.email ?? user.id;
                  setSelectedUser(user);
                  setAssigneeSearch(label);
                }
              }}
            />

            {assigneeSearch && !selectedUser && filteredUsers.length > 0 ? (
              <div className="absolute z-10 mt-1 w-full max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow">
                {filteredUsers.map((user) => (
                  <div
                    key={user.id}
                    role="option"
                    tabIndex={0}
                    onMouseDown={(e) => {
                      e.preventDefault();
                    }}
                    onClick={() => {
                      const label = user.name ?? user.email ?? user.id;
                      setSelectedUser(user);
                      setAssigneeSearch(label);
                      window.setTimeout(() => {
                        setAssigneeSearch(label);
                      }, 0);
                    }}
                    className="flex cursor-pointer items-center justify-between rounded-md px-3 py-2 hover:bg-gray-100"
                  >
                    <span className="font-medium">{user.name ?? user.email ?? "Unknown"}</span>
                    <span className="text-xs italic text-gray-400">{user.job_role ?? "user"}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="overflow-auto max-h-[80vh] border border-slate-200 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 uppercase">
              <th className="px-4 py-2">Key</th>
              <th className="px-4 py-2">Summary</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Assignee</th>
              <th className="px-4 py-2">Start Date</th>
              <th className="px-4 py-2">Due Date</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTasks.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                  No tasks to show.
                </td>
              </tr>
            ) : (
              filteredTasks.map((task, index) => {
                const statusKey = normalizeStatusKey(task.status);
                const statusLabel = statusKey.replace(/_/g, " ");

                return (
                <tr key={task.id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-2">TASK-{index + 1}</td>
                  <td className="px-4 py-2 font-medium">{task.title ?? ""}</td>
                  <td className="px-4 py-2">
                    <span
                      className={[
                        "inline-block rounded px-2 py-1 text-xs font-medium capitalize",
                        statusBadgeClass(statusKey),
                      ].join(" ")}
                    >
                      {statusLabel}
                    </span>
                  </td>
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
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
