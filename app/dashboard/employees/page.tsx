"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAppData } from "@/components/providers/AppDataProvider";

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  system_role: string | null;
  job_role: string | null;
};

type TaskRow = {
  id: string;
  title: string | null;
};

type ProjectRow = {
  id: string;
  name: string | null;
};

type UpdateRow = {
  id: string;
  task_id: string;
  project_id: string;
  user_id: string;
  content: string;
  created_at: string;
};

type EnrichedUpdate = {
  id: string;
  projectId: string;
  projectName: string;
  taskName: string;
  content: string;
  createdAt: string;
};

type RoleRow = {
  job_role: string | null;
};

export default function EmployeesPage() {
  const { profile } = useAppData();
  const isAdmin = (profile?.system_role ?? profile?.role ?? "").toLowerCase() === "admin";
  const [users, setUsers] = useState<UserRow[]>([]);
  const [updates, setUpdates] = useState<UpdateRow[]>([]);
  const [tasksById, setTasksById] = useState<Record<string, TaskRow>>({});
  const [projectsById, setProjectsById] = useState<Record<string, ProjectRow>>({});
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [roleOptions, setRoleOptions] = useState<string[]>(["All"]);
  const [selectedRole, setSelectedRole] = useState<string>("All");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const loadEmployees = async () => {
      setIsLoading(true);

      try {
        const [usersResponse, updatesResponse, rolesResponse] = await Promise.all([
          supabase.from("users").select("id, name, email, system_role, job_role").order("name", { ascending: true }),
          supabase.from("task_updates").select("id, task_id, project_id, user_id, content, created_at").order("created_at", { ascending: false }),
          supabase.from("users").select("job_role").not("job_role", "is", null),
        ]);

        if (usersResponse.error) {
          throw usersResponse.error;
        }

        if (updatesResponse.error) {
          throw updatesResponse.error;
        }

        if (rolesResponse.error) {
          throw rolesResponse.error;
        }

        const userRows = (usersResponse.data as UserRow[] | null | undefined) ?? [];
        const updateRows = (updatesResponse.data as UpdateRow[] | null | undefined) ?? [];
        const taskIds = Array.from(new Set(updateRows.map((update) => update.task_id)));
        const projectIds = Array.from(new Set(updateRows.map((update) => update.project_id)));

        const [tasksResponse, projectsResponse] = await Promise.all([
          taskIds.length > 0
            ? supabase.from("tasks").select("id, title").in("id", taskIds)
            : Promise.resolve({ data: [], error: null }),
          projectIds.length > 0
            ? supabase.from("projects").select("id, name").in("id", projectIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if ("error" in tasksResponse && tasksResponse.error) {
          throw tasksResponse.error;
        }

        if ("error" in projectsResponse && projectsResponse.error) {
          throw projectsResponse.error;
        }

        const tasks = ("data" in tasksResponse ? (tasksResponse.data as TaskRow[] | null | undefined) : []) ?? [];
        const projects = ("data" in projectsResponse ? (projectsResponse.data as ProjectRow[] | null | undefined) : []) ?? [];

        const taskMap = tasks.reduce<Record<string, TaskRow>>((acc, task) => {
          acc[task.id] = task;
          return acc;
        }, {});

        const projectMap = projects.reduce<Record<string, ProjectRow>>((acc, project) => {
          acc[project.id] = project;
          return acc;
        }, {});

        if (!isMounted) {
          return;
        }

        const visibleUsers = userRows.filter((user) => user.id !== profile?.id);
        const dynamicRoles = Array.from(
          new Set(
            (((rolesResponse.data as RoleRow[] | null | undefined) ?? [])
              .map((row) => row.job_role?.trim())
              .filter((role): role is string => Boolean(role && role.toLowerCase() !== "super_admin"))),
          ),
        ).sort((left, right) => left.localeCompare(right));

        setUsers(visibleUsers);
        setRoleOptions(["All", ...dynamicRoles]);
        setUpdates(updateRows);
        setTasksById(taskMap);
        setProjectsById(projectMap);
        setSelectedUserId((current) => current ?? visibleUsers[0]?.id ?? null);
        setErrorMessage(null);
      } catch (loadError) {
        console.error("Failed to load employees", loadError);
        if (isMounted) {
          setUsers([]);
          setUpdates([]);
          setTasksById({});
          setProjectsById({});
          setErrorMessage("Failed to load employees.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadEmployees();

    return () => {
      isMounted = false;
    };
  }, [isAdmin, profile?.id]);

  const filteredUsers = useMemo(() => {
    if (selectedRole === "All") {
      return users;
    }

    return users.filter((user) => (user.job_role ?? "").toLowerCase() === selectedRole.toLowerCase());
  }, [selectedRole, users]);

  useEffect(() => {
    if (!selectedUserId) {
      return;
    }

    const exists = filteredUsers.some((user) => user.id === selectedUserId);
    if (!exists) {
      setSelectedUserId(filteredUsers[0]?.id ?? null);
    }
  }, [filteredUsers, selectedUserId]);

  const selectedUser = useMemo(() => filteredUsers.find((user) => user.id === selectedUserId) ?? null, [filteredUsers, selectedUserId]);

  const selectedUpdates = useMemo<EnrichedUpdate[]>(() => {
    if (!selectedUserId) {
      return [];
    }

    return updates
      .filter((update) => update.user_id === selectedUserId)
      .map((update) => ({
        id: update.id,
        projectId: update.project_id,
        projectName: projectsById[update.project_id]?.name ?? "Untitled project",
        taskName: tasksById[update.task_id]?.title ?? "Untitled task",
        content: update.content,
        createdAt: update.created_at,
      }));
  }, [projectsById, selectedUserId, tasksById, updates]);

  const updatesByProject = useMemo(() => {
    return selectedUpdates.reduce<Record<string, EnrichedUpdate[]>>((acc, update) => {
      if (!acc[update.projectId]) {
        acc[update.projectId] = [];
      }

      acc[update.projectId].push(update);
      return acc;
    }, {});
  }, [selectedUpdates]);

  const projectGroups = useMemo(
    () =>
      Object.entries(updatesByProject)
        .map(([projectId, projectUpdates]) => ({
          projectId,
          projectName: projectUpdates[0]?.projectName ?? "Untitled project",
          updates: projectUpdates.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
        }))
        .sort((left, right) => new Date(right.updates[0]?.createdAt ?? 0).getTime() - new Date(left.updates[0]?.createdAt ?? 0).getTime()),
    [updatesByProject],
  );

  if (!isAdmin) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-slate-900">Employees</p>
        <p className="mt-2 text-sm text-slate-500">This page is available to admins only.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Admin</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Employees</h1>
        <p className="mt-2 text-sm text-slate-500">View task updates by employee.</p>
      </div>

      <div className="flex items-center gap-3">
        <label htmlFor="employee-role-filter" className="text-sm font-medium text-slate-600">
          Role
        </label>
        <select
          id="employee-role-filter"
          value={selectedRole}
          onChange={(event) => setSelectedRole(event.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-slate-300 focus:outline-none"
        >
          {roleOptions.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? <div className="text-sm text-slate-500">Loading employees...</div> : null}
      {errorMessage ? <div className="text-sm text-red-600">{errorMessage}</div> : null}

      {!isLoading && !errorMessage ? (
        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Team</p>
            <div className="mt-4 space-y-2">
              {filteredUsers.map((user) => {
                const active = user.id === selectedUserId;
                const initials = (user.name ?? user.email ?? "").split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "--";

                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => setSelectedUserId(user.id)}
                    className={[
                      "flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition",
                      active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <div className={[
                      "flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold",
                      active ? "bg-white/15 text-white" : "bg-slate-100 text-slate-700",
                    ].join(" ")}>
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{user.name ?? user.email ?? "Unknown user"}</p>
                      <p className={[
                        "truncate text-xs uppercase tracking-[0.2em]",
                        active ? "text-slate-300" : "text-slate-400",
                      ].join(" ")}>
                        {user.job_role ?? user.system_role ?? "User"}
                      </p>
                    </div>
                  </button>
                );
              })}
              {filteredUsers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-5 text-sm text-slate-500">
                  No employees found for this role.
                </div>
              ) : null}
            </div>
          </aside>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Selected employee</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">{selectedUser?.name ?? selectedUser?.email ?? "Select an employee"}</h2>
                <p className="mt-1 text-sm text-slate-500">Latest task updates grouped by project.</p>
              </div>
              <div className="rounded-full bg-slate-50 px-4 py-2 text-sm font-medium text-slate-600">
                {selectedUpdates.length} updates
              </div>
            </div>

            <div className="mt-5 space-y-5">
              {projectGroups.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  No updates yet.
                </div>
              ) : (
                projectGroups.map((group) => (
                  <div key={group.projectId} className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Project</p>
                        <h3 className="mt-1 text-lg font-semibold text-slate-900">{group.projectName}</h3>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        {group.updates.length}
                      </span>
                    </div>

                    <div className="mt-4 space-y-3">
                      {group.updates.map((update) => (
                        <div key={update.id} className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900">{update.taskName}</p>
                              <p className="mt-1 text-sm leading-6 text-slate-600">{update.content}</p>
                            </div>
                            <p className="whitespace-nowrap text-xs text-slate-400">
                              {new Date(update.createdAt).toLocaleString(undefined, {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
