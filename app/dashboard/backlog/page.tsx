"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type ProjectRow = {
  id: string;
  name: string | null;
  owner_id: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

type TaskRow = {
  id: string;
  title: string | null;
  status: string | null;
  project_id: string | null;
  created_at: string | null;
  completed_at: string | null;
  project: {
    id: string;
    name: string | null;
  } | null;
  assigned_user: {
    email: string | null;
  } | null;
  task_assignees?: {
    user: {
      email: string | null;
      name: string | null;
    } | null;
  }[] | null;
  assignees?: { email: string | null; name: string | null }[];
};

type GroupedTasks = Record<string, TaskRow[]>;

function getTaskCode(index: number) {
  return `PROJ-${100 + index}`;
}

function getDays(task: TaskRow) {
  if (!task.completed_at || !task.created_at) {
    return "0.00";
  }

  const diff = new Date(task.completed_at).getTime() - new Date(task.created_at).getTime();
  return (diff / (1000 * 60 * 60 * 24)).toFixed(2);
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "N/A";
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function getInitials(email: string | null | undefined) {
  return email?.slice(0, 2).toUpperCase() || "NA";
}

function getStatusColor(status: string | null | undefined) {
  switch (status) {
    case "todo":
      return "bg-red-400";
    case "in_progress":
      return "bg-yellow-400";
    case "in_review":
      return "bg-blue-400";
    case "done":
      return "bg-green-400";
    default:
      return "bg-gray-400";
  }
}

export default function DashboardBacklogPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [openProjects, setOpenProjects] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      if (isMounted) {
        setLoading(true);
      }

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          throw authError;
        }

        if (!user) {
          throw new Error("Not authenticated");
        }

        const { data: membershipRows, error: membershipError } = await supabase
          .from("project_members")
          .select("project_id")
          .eq("user_id", user.id);

        if (membershipError) {
          throw membershipError;
        }

        const memberProjectIds = Array.from(
          new Set(
            (membershipRows ?? [])
              .map((row) => row.project_id)
              .filter((projectId): projectId is string => Boolean(projectId)),
          ),
        );

        let projectQuery = supabase.from("projects").select("id, name, owner_id, start_date, end_date");

        if (memberProjectIds.length > 0) {
          const membershipFilter = `id.in.(${memberProjectIds.join(",")})`;
          projectQuery = projectQuery.or([`owner_id.eq.${user.id}`, membershipFilter].join(","));
        } else {
          projectQuery = projectQuery.eq("owner_id", user.id);
        }

        const primaryProjectResult = await projectQuery;
        let projectError = primaryProjectResult.error;
        let accessibleProjects: ProjectRow[] = (primaryProjectResult.data ?? []) as ProjectRow[];

        if (projectError) {
          const mayBeMissingDateColumns =
            projectError.code === "42703" ||
            (projectError.message ?? "").toLowerCase().includes("start_date") ||
            (projectError.message ?? "").toLowerCase().includes("end_date");

          if (mayBeMissingDateColumns) {
            let fallbackQuery = supabase.from("projects").select("id, name, owner_id");

            if (memberProjectIds.length > 0) {
              const membershipFilter = `id.in.(${memberProjectIds.join(",")})`;
              fallbackQuery = fallbackQuery.or([`owner_id.eq.${user.id}`, membershipFilter].join(","));
            } else {
              fallbackQuery = fallbackQuery.eq("owner_id", user.id);
            }

            const fallbackResult = await fallbackQuery;
            accessibleProjects = (fallbackResult.data ?? []) as ProjectRow[];
            projectError = fallbackResult.error;
          }
        }

        if (projectError) {
          throw projectError;
        }

        const accessibleProjectIds = accessibleProjects.map((project) => project.id);

        let taskQuery = supabase
          .from("tasks")
          .select(
            `
              *,
              project:projects(id, name, start_date, end_date),
              assigned_user:users(email),
              task_assignees(
                user:users(email, name)
              )
            `,
          )
          .order("created_at", { ascending: false, nullsFirst: false });

        if (accessibleProjectIds.length > 0) {
          taskQuery = taskQuery.in("project_id", accessibleProjectIds);
        } else {
          taskQuery = taskQuery.eq("project_id", "00000000-0000-0000-0000-000000000000");
        }

        const { data: tasksData, error: taskError } = await taskQuery;

        if (taskError) {
          throw taskError;
        }

        if (isMounted) {
          const normalizedTasks = ((tasksData ?? []) as TaskRow[]).map(task => {
            // Build multi-assignee list
            const multiUsers = (task.task_assignees ?? [])
              .map((a: any) => a.user)
              .filter(Boolean) as { email: string | null; name: string | null }[];
            const primaryUser = task.assigned_user ? { email: task.assigned_user.email, name: null as string | null } : null;
            const assignees = [
              ...(primaryUser ? [primaryUser] : []),
              ...multiUsers.filter(u => u.email !== primaryUser?.email),
            ];
            return { ...task, assignees };
          }).sort((a, b) => {
            const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
            const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
            return bTime - aTime;
          });

          setProjects(accessibleProjects);
          setTasks(normalizedTasks);
          setOpenProjects(
            accessibleProjects.reduce<Record<string, boolean>>((acc, project) => {
              acc[project.id] = true;
              return acc;
            }, {}),
          );
          setErrorMessage(null);
        }
      } catch (error) {
        console.error("Failed to load backlog", error);
        if (isMounted) {
          setProjects([]);
          setTasks([]);
          setOpenProjects({});
          setErrorMessage("Failed to load backlog.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  const groupedTasks = useMemo(() => {
    return tasks.reduce<GroupedTasks>((acc, task) => {
      const projectId = task.project_id ?? "unknown";
      if (!acc[projectId]) {
        acc[projectId] = [];
      }
      acc[projectId].push(task);
      return acc;
    }, {});
  }, [tasks]);

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
    [projects],
  );

  const handleToggleProject = (projectId: string) => {
    setOpenProjects((prev) => ({
      ...prev,
      [projectId]: !prev[projectId],
    }));
  };

  if (loading) {
    return <div>Loading backlog...</div>;
  }

  if (errorMessage) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-red-600">
        {errorMessage}
      </div>
    );
  }

  if (sortedProjects.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-xl font-semibold text-slate-900">No projects found</p>
        <p className="text-sm text-slate-500">Projects you can access will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-400">Dashboard</p>
        <h1 className="text-3xl font-semibold text-slate-900">Backlog</h1>
        <p className="mt-2 text-sm text-slate-500">Project-based task history grouped by project.</p>
      </header>

      <div className="space-y-8">
        {sortedProjects.map((project) => {
          const projectTasks = groupedTasks[project.id] ?? [];
          const projectName = project.name ?? "Unnamed Project";
          const isOpen = openProjects[project.id] ?? false;

          return (
            <section key={project.id} className="mb-4 rounded-lg border border-gray-200">
              <div className="flex cursor-pointer items-center justify-between p-4" onClick={() => handleToggleProject(project.id)}>
                <div>
                  <div className="flex items-center gap-2">
                    <span>{isOpen ? "▼" : "▶"}</span>
                    <h2 className="font-semibold text-slate-900">{projectName}</h2>
                  </div>
                  <p className="text-sm text-gray-500">
                    {formatDate(project.start_date)} - {formatDate(project.end_date)} • {projectTasks.length} tasks
                  </p>
                </div>
                <button type="button" className="text-sm text-red-500" onClick={(event) => event.stopPropagation()}>
                  Delete
                </button>
              </div>

              {isOpen && (
                <div className="px-4 pb-4">
                  {projectTasks.map((task, index) => {
                    const assigneeInitials = getInitials(task.assigned_user?.email);
                    const days = getDays(task);
                    const taskCode = getTaskCode(index + 1);
                    const normalizedStatus = (task.status ?? "todo").toLowerCase();

                    return (
                      <div key={task.id} className="flex items-center justify-between border-b border-gray-200 py-2">
                        <div className="flex items-center gap-3">
                          <div className={`h-2 w-2 rounded-full ${getStatusColor(normalizedStatus)}`} />
                          <span className="text-sm text-gray-400">{taskCode}</span>
                          <span className="text-sm text-slate-900">{task.title ?? "Untitled task"}</span>
                        </div>

                        <div className="flex items-center gap-4">
                          <span className="text-xs uppercase text-gray-500">{normalizedStatus}</span>
                          <div
                            className="flex items-center -space-x-1"
                            title={task.assignees?.map(u => u.name ?? u.email ?? "").filter(Boolean).join(", ") ?? ""}
                          >
                            {(task.assignees && task.assignees.length > 0 ? task.assignees.slice(0, 2) : [{ email: task.assigned_user?.email ?? null, name: null }]).map((user, idx) => {
                              const initials = getInitials(user.name ?? user.email);
                              return (
                                <div key={`${user.email ?? idx}`} className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs text-gray-700 border border-white" title={user.name ?? user.email ?? ""}>
                                  {initials}
                                </div>
                              );
                            })}
                            {task.assignees && task.assignees.length > 2 && (
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-[10px] text-gray-600 border border-white font-medium">
                                +{task.assignees.length - 2}
                              </div>
                            )}
                          </div>
                          {normalizedStatus === "done" && <span className="text-sm text-gray-500">{days}d</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}