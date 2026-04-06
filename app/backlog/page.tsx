"use client";

import { useEffect, useMemo, useState } from "react";
import ProjectBacklogSection from "../../components/backlog/ProjectBacklogSection";
import { useAppData } from "@/components/providers/AppDataProvider";
import { supabase } from "@/lib/supabaseClient";

type ProjectSummary = {
  id: string;
  name: string;
  is_active?: boolean;
  is_completed?: boolean;
  ownerId?: string;
};

type TaskRow = {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "in_review" | "done" | string;
  assigned_to: string | null;
  created_at: string | null;
  updated_at: string | null;
  project_id: string | null;
};

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
};

type TaskWithUser = TaskRow & {
  assignedUser: UserRow | null;
};

type TasksByProject = Record<string, TaskWithUser[]>;

export default function BacklogPage() {
  const { projects, isProjectsLoading, authUser, profile, refreshProjects } = useAppData();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tasksByProject, setTasksByProject] = useState<TasksByProject>({});
  const [openProjects, setOpenProjects] = useState<Record<string, boolean>>({});
  const currentUserId = authUser?.id ?? null;
  const isAdmin = (profile?.system_role ?? profile?.role ?? "").toLowerCase() === "admin";

  const safeProjects = useMemo<ProjectSummary[]>(
    () =>
      [...projects]
        .map((project) => ({
          id: project.id,
          name: project.name,
          is_active: (project as any).is_active !== false,
          is_completed: (project as any).is_completed === true,
          ownerId: project.ownerId,
        }))
        .sort(
          (a, b) =>
            Number(Boolean(a.is_completed || a.is_active === false)) -
            Number(Boolean(b.is_completed || b.is_active === false)),
        ),
    [projects],
  );

  useEffect(() => {
    if (isProjectsLoading) {
      return;
    }

    let isMounted = true;

    const loadBacklog = async () => {
      if (isMounted) {
        setLoading(true);
      }

      try {
        const projectIds = safeProjects.map((project) => project.id);

        const grouped: TasksByProject = {};
        safeProjects.forEach((project) => {
          grouped[project.id] = [];
        });

        if (projectIds.length === 0) {
          if (isMounted) {
            setTasksByProject(grouped);
            setOpenProjects({});
            setError(null);
          }
          return;
        }

        const { data: tasks, error: tasksError } = await supabase
          .from("tasks")
          .select("id, title, status, assigned_to, created_at, updated_at, project_id")
          .in("project_id", projectIds);

        if (tasksError) {
          throw tasksError;
        }

        const assignedUserIds = Array.from(
          new Set(
            (tasks ?? [])
              .map((task) => task.assigned_to)
              .filter((assignedTo): assignedTo is string => Boolean(assignedTo)),
          ),
        );

        let usersById: Record<string, UserRow> = {};

        if (assignedUserIds.length > 0) {
          const { data: users, error: usersError } = await supabase
            .from("users")
            .select("id, name, email")
            .in("id", assignedUserIds);

          if (usersError) {
            throw usersError;
          }

          usersById = (users ?? []).reduce<Record<string, UserRow>>((acc, user) => {
            acc[user.id] = user;
            return acc;
          }, {});
        }

        (tasks ?? []).forEach((task) => {
          if (task.project_id && grouped[task.project_id]) {
            grouped[task.project_id].push({
              ...task,
              assignedUser: task.assigned_to ? usersById[task.assigned_to] ?? null : null,
            });
          }
        });

        if (isMounted) {
          setTasksByProject(grouped);
          setOpenProjects((prev) =>
            safeProjects.reduce<Record<string, boolean>>((acc, project) => {
              acc[project.id] = prev[project.id] ?? true;
              return acc;
            }, {}),
          );
          setError(null);
        }
      } catch (loadError) {
        console.error("Failed to load backlog", loadError);
        if (isMounted) {
          setTasksByProject({});
          setError("Failed to load backlog.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadBacklog();

    return () => {
      isMounted = false;
    };
  }, [isProjectsLoading, safeProjects]);

  const toggleProject = (projectId: string) => {
    setOpenProjects((prev) => ({
      ...prev,
      [projectId]: !prev[projectId],
    }));
  };

  const handleDeleteTask = async (projectId: string, taskId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) {
      alert("Project not found");
      return;
    }

    const safeProject = safeProjects.find((p) => p.id === projectId);
    const canManageProject = Boolean(isAdmin || currentUserId === safeProject?.ownerId);
    console.log("DELETE TASK - USER:", currentUserId, "PROJECT OWNER:", safeProject?.ownerId, "IS OWNER:", currentUserId === safeProject?.ownerId, "IS ADMIN:", isAdmin);
    if (!canManageProject) {
      alert("Only project owner or admin can delete tasks");
      return;
    }

    const confirmed = window.confirm("Are you sure you want to delete this task?");
    if (!confirmed) {
      return;
    }

    const { error: deleteError } = await supabase
      .from("tasks")
      .delete()
      .eq("id", taskId)
      .eq("project_id", projectId);

    if (deleteError) {
      console.error(deleteError);
      alert("Failed to delete task");
      return;
    }

    console.log("Deleted task:", taskId);
    setTasksByProject((prev) => ({
      ...prev,
      [projectId]: (prev[projectId] ?? []).filter((task) => task.id !== taskId),
    }));
  };

  const handleDeleteProject = async (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) {
      alert("Project not found");
      return;
    }

    const safeProject = safeProjects.find((p) => p.id === projectId);
    const canManageProject = Boolean(isAdmin || currentUserId === safeProject?.ownerId);
    console.log("DELETE PROJECT - USER:", currentUserId, "PROJECT OWNER:", safeProject?.ownerId, "IS OWNER:", currentUserId === safeProject?.ownerId, "IS ADMIN:", isAdmin);
    if (!canManageProject) {
      alert("Only project owner or admin can permanently delete projects");
      return;
    }

    const isCompleted = Boolean(safeProject?.is_completed) || safeProject?.is_active === false;
    if (!isCompleted) {
      alert("Only completed projects can be deleted.");
      return;
    }

    const confirmed = window.confirm(
      "This will permanently delete the project and all its tasks. Are you sure?"
    );
    if (!confirmed) {
      return;
    }

    try {
      const { error: tasksError } = await supabase
        .from("tasks")
        .delete()
        .eq("project_id", projectId);

      if (tasksError) {
        console.error(tasksError);
        alert("Failed to delete project tasks");
        return;
      }

      const { error: membersError } = await supabase
        .from("project_members")
        .delete()
        .eq("project_id", projectId);

      if (membersError) {
        console.error(membersError);
        alert("Failed to delete project members");
        return;
      }

      const { error: projectError } = await supabase
        .from("projects")
        .delete()
        .eq("id", projectId);

      if (projectError) {
        console.error(projectError);
        alert("Failed to delete project");
        return;
      }

      console.log("Hard deleted project:", projectId);
      setTasksByProject((prev) => {
        const updated = { ...prev };
        delete updated[projectId];
        return updated;
      });
      await refreshProjects();
    } catch (error) {
      console.error("Error deleting project:", error);
      alert("An error occurred while deleting the project");
    }
  };

  const markProjectCompleted = async (projectId: string) => {
    const safeProject = safeProjects.find((p) => p.id === projectId);
    const canManageProject = Boolean(isAdmin || currentUserId === safeProject?.ownerId);

    if (!canManageProject) {
      alert("Only project owner or admin can mark project as completed");
      return;
    }

    const { error: completeError } = await supabase
      .from("projects")
      .update({ is_completed: true })
      .eq("id", projectId);

    if (completeError) {
      console.error(completeError);
      alert("Failed to mark project completed");
      return;
    }

    await refreshProjects();
  };

  if (loading || isProjectsLoading) {
    return (
      <div className="space-y-6 text-slate-900">
        <h1 className="text-3xl font-semibold">Backlog</h1>
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">Loading backlog...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 text-slate-900">
        <h1 className="text-3xl font-semibold">Backlog</h1>
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-900">
      <h1 className="text-3xl font-semibold">Backlog</h1>

      {safeProjects.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          No accessible projects found.
        </div>
      ) : (
        <div className="space-y-4">
          {safeProjects.map((project) => {
            const canManageProject = Boolean(isAdmin || currentUserId === project.ownerId);
            console.log("BACKLOG - USER:", currentUserId, "PROJECT OWNER:", project.ownerId, "IS OWNER:", currentUserId === project.ownerId, "IS ADMIN:", isAdmin);
            return (
              <ProjectBacklogSection
                key={project.id}
                project={project}
                tasks={tasksByProject[project.id] ?? []}
                isOpen={openProjects[project.id] ?? true}
                onToggle={() => toggleProject(project.id)}
                onDeleteTask={(taskId) => handleDeleteTask(project.id, taskId)}
                onDeleteProject={() => handleDeleteProject(project.id)}
                onMarkCompleted={() => markProjectCompleted(project.id)}
                isCompleted={Boolean(project.is_completed) || project.is_active === false}
                canDelete={canManageProject}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}